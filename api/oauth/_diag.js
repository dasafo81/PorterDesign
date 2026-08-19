import { decrypt, json, serviceConfig, supabase } from './_common.js';

export const config = { runtime: 'edge' };

// TEMPORARY diagnostic endpoint. Gated behind OAUTH_DIAG_KEY (preview only).
// Returns ONLY status/error strings and lengths — never access or refresh tokens.
// Delete this file and the OAUTH_DIAG_KEY env var after diagnosis.
export default async function handler(req) {
  const u = new URL(req.url);
  const key = u.searchParams.get('key');
  const expected = process.env.OAUTH_DIAG_KEY;
  if (!expected || key !== expected) return new Response('Not found', { status: 404 });
  try {
    serviceConfig();
    const provider = u.searchParams.get('provider') || 'google';
    const email = u.searchParams.get('email');
    const userId = u.searchParams.get('user_id');
    let q = `oauth_connections?provider=eq.${provider}&select=*`;
    if (userId) q += `&user_id=eq.${encodeURIComponent(userId)}`;
    else if (email) q += `&provider_email=eq.${encodeURIComponent(email)}`;
    const r = await supabase(q);
    const rows = r.ok ? await r.json() : [];
    if (!rows[0]) return json({ found: false, query: { provider, email, userId } });
    const c = rows[0];
    const out = {
      found: true,
      provider_email: c.provider_email,
      provider_account_id: c.provider_account_id,
      scopes: c.scopes,
      created_at: c.created_at,
      updated_at: c.updated_at,
      access_token_expires_at: c.access_token_expires_at,
      has_refresh_ct: !!c.refresh_token_ciphertext,
    };
    let refreshToken;
    try {
      refreshToken = await decrypt(c.refresh_token_ciphertext);
      out.decrypt_ok = true;
      out.refresh_len = refreshToken.length;
      out.refresh_prefix = refreshToken.slice(0, 4);
    } catch (e) {
      out.decrypt_ok = false;
      out.decrypt_err = e.message;
      return json(out);
    }
    const cid = provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MICROSOFT_OAUTH_CLIENT_ID;
    out.client_id_tail = cid ? cid.slice(-16) : null;
    const body = new URLSearchParams({
      client_id: cid,
      client_secret: provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const tr = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tk = await tr.json();
    out.google_status = tr.status;
    out.google_ok = tr.ok && !!tk.access_token;
    out.google_error = tk.error || null;
    out.google_error_description = tk.error_description || null;
    out.google_scope = tk.scope || null;
    out.google_expires_in = tk.expires_in || null;
    return json(out);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
