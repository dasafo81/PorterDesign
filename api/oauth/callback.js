import { cors, encrypt, json, redirectUri, serviceConfig, supabase } from './_common.js';

export const config = { runtime: 'edge' };

export async function handleCallback(req, providerOverride = null) {
  const u = new URL(req.url), provider = providerOverride || u.searchParams.get('provider'), code = u.searchParams.get('code'), state = u.searchParams.get('state');
  if (!provider || !code || !state) return json({ error: 'Missing OAuth parameters' }, 400, cors());
  try {
    serviceConfig();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
    const stateHash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    const sr = await supabase(`oauth_states?state_hash=eq.${encodeURIComponent(stateHash)}&select=*`);
    const rows = sr.ok ? await sr.json() : [];
    const saved = rows[0];
    if (!saved || new Date(saved.expires_at).getTime() < Date.now()) return json({ error: 'OAuth state expired' }, 400, cors());
    const body = new URLSearchParams({
      client_id: provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MICROSOFT_OAUTH_CLIENT_ID,
      client_secret: provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      code, redirect_uri: redirectUri(provider), grant_type: 'authorization_code',
    });
    const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const tr = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokens = await tr.json();
    if (!tr.ok || !tokens.refresh_token) return json({ error: 'Provider did not return a refresh token' }, 400, cors());
    const ir = await fetch(provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await ir.json();
    let tokenClaims = {};
    if (provider === 'microsoft' && tokens.access_token) {
      try {
        const part = tokens.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        tokenClaims = JSON.parse(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, '=')));
      } catch (_) {}
    }
    const providerAccountId = provider === 'google'
      ? info.sub
      : (info.id || tokenClaims.oid || tokenClaims.sub || info.userPrincipalName || info.mail);
    if (!providerAccountId) {
      return json({ error: 'Microsoft account identifier missing', detail: info.error || 'Graph /me returned no id' }, 502, cors());
    }
    const saveConnection = await supabase('oauth_connections?on_conflict=user_id,provider,provider_account_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({
      user_id: saved.user_id, tenant_id: saved.tenant_id, provider,
      provider_account_id: providerAccountId,
      provider_email: info.email || info.mail || info.userPrincipalName || null,
      scopes: tokens.scope || '', refresh_token_ciphertext: await encrypt(tokens.refresh_token),
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    }) });
    if (!saveConnection.ok) {
      const detail = await saveConnection.text();
      return json({ error: 'OAuth connection could not be saved', detail: detail.slice(0, 500) }, 502, cors());
    }
    await supabase(`oauth_states?state_hash=eq.${encodeURIComponent(stateHash)}`, { method: 'DELETE' });
    const origin = process.env.APP_ORIGIN || 'https://www.asystentdekoracji.pl';
    return new Response(null, { status: 302, headers: { ...cors(), Location: `${origin}/?oauth=${provider}&connected=1&return=mail` } });
  } catch (e) {
    return json({ error: e.message || 'OAuth callback failed' }, 500, cors());
  }
}

export default handleCallback;
