import { cors, decrypt, json, serviceConfig, supabase, userFromRequest } from './_common.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors());
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'Unauthorized' }, 401, cors());
    const provider = new URL(req.url).searchParams.get('provider');
    if (!['google', 'microsoft'].includes(provider)) return json({ error: 'Invalid provider' }, 400, cors());
    serviceConfig();
    const r = await supabase(`oauth_connections?user_id=eq.${encodeURIComponent(user.id)}&provider=eq.${provider}&select=*`);
    const rows = r.ok ? await r.json() : [];
    if (!rows[0]) return json({ error: 'OAUTH_RECONNECT_REQUIRED' }, 404, cors());
    const connection = rows[0];
    const refreshToken = await decrypt(connection.refresh_token_ciphertext);
    const body = new URLSearchParams({
      client_id: provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MICROSOFT_OAUTH_CLIENT_ID,
      client_secret: provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    });
    const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const tr = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokens = await tr.json();
    if (!tr.ok || !tokens.access_token) return json({ error: 'OAUTH_RECONNECT_REQUIRED' }, 401, cors());
    return json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in || 3600,
      provider,
      provider_email: connection.provider_email || null,
    }, 200, cors());
  } catch (e) {
    return json({ error: e.message || 'Token refresh failed' }, 500, cors());
  }
}
