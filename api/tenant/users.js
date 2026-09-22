// api/tenant/users.js
// Vercel Edge Function — zwraca userów z tenanta ZALOGOWANEGO wywołującego.
// W odróżnieniu od api/admin/users.js (tylko super-admin, dowolny tenant_id z query),
// ten endpoint działa dla każdego zalogowanego usera i zawsze bierze tenant_id
// z JEGO WŁASNEGO JWT — nie da się w ten sposób zobaczyć userów innego tenanta.
//
// Używany do listy "kto może być przypisany do dealu" w CRM.
//
// GET /api/tenant/users
// Zwraca: [{id, email, display_name, color}]

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured on Vercel' }, 500);

  const authHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!authHeader) return json({ error: 'missing bearer token' }, 401);

  // Zweryfikuj JWT wywołującego i wyciągnij JEGO WŁASNY tenant_id — nigdy z query/body.
  const meResp = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${authHeader}` },
  });
  if (!meResp.ok) return json({ error: 'invalid or expired token' }, 401);
  const me = await meResp.json();
  const tenantId = me && me.app_metadata && me.app_metadata.tenant_id;
  if (!tenantId) return json({ error: 'no tenant associated with this account' }, 403);

  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const resp = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers });
  if (!resp.ok) return json({ error: 'failed to list users', detail: await resp.text() }, 500);
  const data = await resp.json();

  const users = (data.users || [])
    .filter(function(u) { return u.app_metadata && u.app_metadata.tenant_id === tenantId; })
    .map(function(u) {
      const um = u.user_metadata || {};
      return {
        id: u.id,
        email: u.email,
        display_name: um.display_name || '',
        color: um.color || '',
      };
    })
    .sort(function(a, b) { return (a.display_name || a.email).localeCompare(b.display_name || b.email, 'pl'); });

  return json(users);
}
