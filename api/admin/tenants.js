export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}

// Weryfikuje JWT wywolujacego, zwraca super-admin user + service_role key
// albo blad gotowy do zwrocenia klientowi.
async function verifyAdmin(req) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return { ok: false, status: 500, message: 'SUPABASE_SERVICE_ROLE_KEY not configured on Vercel' };
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, message: 'missing bearer token' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid or expired token' };
  const user = await r.json();
  if (!user || !user.app_metadata || user.app_metadata.is_super_admin !== true) {
    return { ok: false, status: 403, message: 'super-admin role required' };
  }
  return { ok: true, user, service: SERVICE };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const headers = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    'Content-Type': 'application/json',
  };

  if (req.method === 'GET') {
    // Lista tenantow + agregowane countsy (userow i klientow per tenant).
    const [tenantsResp, usersResp, clientsResp] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/tenants?select=*&order=created_at.asc`, { headers }),
      fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers }),
      fetch(`${SB_URL}/rest/v1/clients?select=tenant_id`, { headers }),
    ]);
    if (!tenantsResp.ok) return json({ error: 'failed to list tenants', detail: await tenantsResp.text() }, 500);
    if (!usersResp.ok)   return json({ error: 'failed to list users',   detail: await usersResp.text() }, 500);
    if (!clientsResp.ok) return json({ error: 'failed to list clients', detail: await clientsResp.text() }, 500);

    const tenants = await tenantsResp.json();
    const usersData = await usersResp.json();
    const clients = await clientsResp.json();

    const userCount = {};
    (usersData.users || []).forEach(function(u) {
      const tid = u.app_metadata && u.app_metadata.tenant_id;
      if (tid) userCount[tid] = (userCount[tid] || 0) + 1;
    });
    const clientCount = {};
    (clients || []).forEach(function(c) {
      if (c.tenant_id) clientCount[c.tenant_id] = (clientCount[c.tenant_id] || 0) + 1;
    });

    return json((tenants || []).map(function(t) {
      return {
        id: t.id,
        name: t.name,
        config: t.config || {},
        created_at: t.created_at,
        user_count: userCount[t.id] || 0,
        client_count: clientCount[t.id] || 0,
      };
    }));
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const name = ((body && body.name) || '').trim();
    if (!name) return json({ error: 'name required' }, 400);

    const ins = await fetch(`${SB_URL}/rest/v1/tenants`, {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'return=representation' }),
      body: JSON.stringify({ name: name }),
    });
    if (!ins.ok) return json({ error: 'failed to create tenant', detail: await ins.text() }, 500);
    const created = await ins.json();
    return json(Array.isArray(created) ? created[0] : created, 201);
  }

  if (req.method === 'PATCH') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const tenantId = body && body.id;
    const config = body && body.config;
    if (!tenantId) return json({ error: 'id required' }, 400);
    if (!config || typeof config !== 'object') return json({ error: 'config object required' }, 400);

    const upd = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
      method: 'PATCH',
      headers: Object.assign({}, headers, { Prefer: 'return=representation' }),
      body: JSON.stringify({ config: config }),
    });
    if (!upd.ok) return json({ error: 'failed to update tenant', detail: await upd.text() }, 500);
    const updated = await upd.json();
    if (!Array.isArray(updated) || updated.length === 0) return json({ error: 'tenant not found' }, 404);
    return json(updated[0]);
  }

  // Trwale usuwa tenanta: dane (funkcja SQL delete_tenant_data, migracja 0056) i konta uzytkownikow.
  // Wymaga potwierdzenia nazwa tenanta; blokuje tenanta z wbudowana baza (Porter Design),
  // tenanta wywolujacego, tenantow z kontem super-admina i z aktywna subskrypcja Stripe.
  if (req.method === 'DELETE') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const tenantId = body && body.id;
    if (!tenantId) return json({ error: 'id required' }, 400);

    const tResp = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=*`, { headers });
    if (!tResp.ok) return json({ error: 'failed to load tenant', detail: await tResp.text() }, 500);
    const tArr = await tResp.json();
    const tenant = Array.isArray(tArr) ? tArr[0] : null;
    if (!tenant) return json({ error: 'tenant not found' }, 404);

    if (((body && body.confirm_name) || '').trim() !== (tenant.name || '').trim()) {
      return json({ error: 'Nazwa potwierdzająca nie zgadza się z nazwą tenanta.' }, 400);
    }
    if (tenant.config && tenant.config.builtin_catalog === true) {
      return json({ error: 'Tego tenanta (z wbudowaną bazą Porter Design) nie można usunąć z panelu.' }, 403);
    }
    if (auth.user.app_metadata && auth.user.app_metadata.tenant_id === tenant.id) {
      return json({ error: 'Nie można usunąć własnego tenanta.' }, 403);
    }
    if (tenant.stripe_subscription_id && tenant.subscription_status === 'active') {
      return json({ error: 'Tenant ma aktywną subskrypcję Stripe — najpierw ją anuluj.' }, 409);
    }

    const usersResp = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers });
    if (!usersResp.ok) return json({ error: 'failed to list users', detail: await usersResp.text() }, 500);
    const tenantUsers = ((await usersResp.json()).users || []).filter(function(u) {
      return u.app_metadata && u.app_metadata.tenant_id === tenant.id;
    });
    if (tenantUsers.some(function(u) { return u.app_metadata.is_super_admin === true; })) {
      return json({ error: 'Tenant ma konto super-admina — nie można go usunąć.' }, 403);
    }

    // Dane najpierw (jedna transakcja — przy bledzie nic nie ginie), potem konta.
    const rpc = await fetch(`${SB_URL}/rest/v1/rpc/delete_tenant_data`, {
      method: 'POST', headers, body: JSON.stringify({ p_tenant: tenant.id }),
    });
    if (!rpc.ok) return json({ error: 'failed to delete tenant data', detail: await rpc.text() }, 500);
    const deleted = await rpc.json();

    const failedUsers = [];
    for (const u of tenantUsers) {
      const d = await fetch(`${SB_URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers });
      if (!d.ok) failedUsers.push(u.email);
    }
    console.warn('tenant deleted', { id: tenant.id, name: tenant.name, by: auth.user.email, rows: deleted, users: tenantUsers.length });
    return json({ ok: true, deleted_rows: deleted, deleted_users: tenantUsers.length - failedUsers.length, failed_users: failedUsers });
  }

  return json({ error: 'method not allowed' }, 405);
}
