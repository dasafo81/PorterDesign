import { cors, json, serviceConfig, supabase, userFromRequest } from './_common.js';

export const config = { runtime: 'edge' };

// Lista połączeń OAuth zalogowanego użytkownika MDL (bez żadnych tokenów) — klient
// wybiera z niej skrzynkę, do której ma się automatycznie zalogować.
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors());
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'Unauthorized' }, 401, cors());
    serviceConfig();
    const r = await supabase(`oauth_connections?user_id=eq.${encodeURIComponent(user.id)}&select=provider,provider_email,scopes,updated_at&order=updated_at.desc`);
    if (!r.ok) return json({ error: 'Could not read connections' }, 502, cors());
    return json({ connections: await r.json() }, 200, cors());
  } catch (e) {
    return json({ error: e.message || 'Status failed' }, 500, cors());
  }
}
