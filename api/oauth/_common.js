const enc = new TextEncoder();

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

export function cors() {
  return {
    'Access-Control-Allow-Origin': process.env.APP_ORIGIN || 'https://www.asystentdekoracji.pl',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function serviceConfig() {
  const url = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.OAUTH_TOKEN_ENCRYPTION_KEY) throw new Error('OAuth backend is not configured');
  return { url, key };
}

export async function userFromRequest(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { url, key } = serviceConfig();
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

async function cryptoKey() {
  const raw = Uint8Array.from(atob(process.env.OAUTH_TOKEN_ENCRYPTION_KEY), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be base64 for 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), enc.encode(value)));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv); out.set(cipher, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decrypt(value) {
  const raw = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const key = await cryptoKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(plain);
}

export async function supabase(path, options = {}) {
  const { url, key } = serviceConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers },
  });
}

export function redirectUri(provider) {
  const origin = process.env.APP_ORIGIN || 'https://www.asystentdekoracji.pl';
  return provider === 'microsoft'
    ? `${origin}/api/oauth/microsoft-callback`
    : `${origin}/api/oauth/google-callback`;
}
