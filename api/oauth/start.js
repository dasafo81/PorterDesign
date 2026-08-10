import { cors, json, redirectUri, serviceConfig, supabase, userFromRequest } from './_common.js';

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
    const state = crypto.randomUUID() + crypto.randomUUID();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
    const stateHash = btoa(String.fromCharCode(...new Uint8Array(hash)));
    const tenantId = user.app_metadata && user.app_metadata.tenant_id
      ? user.app_metadata.tenant_id : null;
    await supabase('oauth_states', { method: 'POST', body: JSON.stringify({
      state_hash: stateHash, user_id: user.id, tenant_id: tenantId, provider,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }) });
    const params = new URLSearchParams({
      client_id: provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MICROSOFT_OAUTH_CLIENT_ID,
      redirect_uri: redirectUri(provider), response_type: 'code', state,
      scope: provider === 'google'
        ? 'openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
        : 'openid email offline_access Mail.Send Mail.ReadWrite Calendars.ReadWrite',
      access_type: 'offline', prompt: 'consent',
    });
    const host = provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    return json({ url: `${host}?${params}` }, 200, cors());
  } catch (e) {
    return json({ error: e.message || 'OAuth configuration error' }, 500, cors());
  }
}
