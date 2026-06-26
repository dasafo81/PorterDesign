export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}

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

function mapUser(u) {
  if (!u) return null;
  const m = u.app_metadata || {};
  return {
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at || null,
    tenant_id: m.tenant_id || null,
    is_super_admin: m.is_super_admin === true,
    is_tenant_admin: m.is_tenant_admin === true,
    banned_until: u.banned_until || null,
  };
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

  const url = new URL(req.url);

  if (req.method === 'GET') {
    const tenantId = url.searchParams.get('tenant_id');
    const resp = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers });
    if (!resp.ok) return json({ error: 'failed to list users', detail: await resp.text() }, 500);
    const data = await resp.json();
    let users = (data.users || []).map(mapUser);
    if (tenantId) users = users.filter(function(u) { return u.tenant_id === tenantId; });
    users.sort(function(a, b) { return (a.email || '').localeCompare(b.email || ''); });
    return json(users);
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const email = ((body && body.email) || '').trim().toLowerCase();
    const password = (body && body.password) || '';
    const tenantId = (body && body.tenant_id) || '';
    const isTenantAdmin = !!(body && body.is_tenant_admin);
    if (!email || !password || !tenantId) return json({ error: 'email, password and tenant_id are required' }, 400);
    if (password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);

    // Verify tenant exists before creating user.
    const tResp = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=id`, { headers });
    if (!tResp.ok) return json({ error: 'failed to verify tenant', detail: await tResp.text() }, 500);
    const tenantsArr = await tResp.json();
    if (!Array.isArray(tenantsArr) || tenantsArr.length === 0) return json({ error: 'tenant not found' }, 404);

    // Pobierz nazwę tenanta do maila powitalnego
    const tNameResp = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=name`, { headers });
    const tNameArr = tNameResp.ok ? await tNameResp.json() : [];
    const tenantName = (tNameArr[0] && tNameArr[0].name) || '';

    const resp = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        email: email,
        password: password,
        email_confirm: true,
        app_metadata: {
          tenant_id: tenantId,
          is_tenant_admin: isTenantAdmin,
        },
      }),
    });
    if (!resp.ok) return json({ error: 'failed to create user', detail: await resp.text() }, resp.status);
    const created = await resp.json();

    // Wyślij mail powitalny (best-effort — błąd nie blokuje odpowiedzi)
    if (isTenantAdmin) {
      const mailOrigin = new URL(req.url).origin;
      fetch(`${mailOrigin}/api/mail/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.service}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template: 'welcome',
          to: email,
          data: {
            brand_name: tenantName,
            email: email,
            login_url: mailOrigin,
            trial_days: 14,
          },
        }),
      }).catch(function(e) { console.error('welcome mail failed:', e); });
    }

    return json(mapUser(created), 201);
  }

  if (req.method === 'PATCH') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const userId = body && body.user_id;
    const action = body && body.action;
    if (!userId || !action) return json({ error: 'user_id and action required' }, 400);
    if (action !== 'suspend' && action !== 'reactivate') return json({ error: "action must be 'suspend' or 'reactivate'" }, 400);

    const banDur = action === 'suspend' ? '876000h' : 'none';
    const resp = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify({ ban_duration: banDur }),
    });
    if (!resp.ok) return json({ error: 'failed to update user', detail: await resp.text() }, resp.status);
    const updated = await resp.json();
    return json(mapUser(updated));
  }

  return json({ error: 'method not allowed' }, 405);
}
