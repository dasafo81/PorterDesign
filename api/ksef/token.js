// api/ksef/token.js
// Zarządza tokenem KSeF per tenant.
// GET  → zwraca {hasToken, env} (NIE zwraca tokenu w plain-text)
// POST → zapisuje {token, env} (szyfruje AES-GCM kluczem KSEF_ENC_KEY)
// DELETE → usuwa token tenanta
//
// Szyfrowanie: AES-256-GCM, klucz z env KSEF_ENC_KEY (hex 64 znaki = 32 bajty).
// Wygeneruj klucz: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Dodaj jako KSEF_ENC_KEY w Vercel → Settings → Environment Variables.

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
  });
}

// Weryfikuje JWT usera, zwraca {ok, tenantId, service}
async function verifyUser(req) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return { ok: false, status: 500, message: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return { ok: false, status: 401, message: 'missing token' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` },
  });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id in token' };
  return { ok: true, tenantId, service: SERVICE };
}

// AES-256-GCM encrypt → "iv:ciphertext" base64
async function encrypt(plain, hexKey) {
  const keyBytes = hexToBytes(hexKey);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return bytesToBase64(iv) + ':' + bytesToBase64(new Uint8Array(enc));
}

// AES-256-GCM decrypt ← "iv:ciphertext" base64
async function decrypt(combined, hexKey) {
  const [ivB64, ctB64] = combined.split(':');
  const keyBytes = hexToBytes(hexKey);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ctB64)
  );
  return new TextDecoder().decode(dec);
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}
function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY || ENC_KEY.length !== 64) {
    return json({ error: 'KSEF_ENC_KEY not configured (must be 64-char hex). Add to Vercel env vars.' }, 500);
  }

  const sbHeaders = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const credUrl = `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}`;

  // ── GET: czy token istnieje? ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(credUrl + '&select=tenant_id,env,updated_at', { headers: sbHeaders });
    if (!r.ok) return json({ error: 'db error' }, 500);
    const rows = await r.json();
    const row = rows && rows[0];
    return json({ hasToken: !!(row && row.token_encrypted), env: row ? row.env : 'test', updated_at: row ? row.updated_at : null });
  }

  // ── POST: zapisz token ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const token = (body && body.token || '').trim();
    const env   = (body && body.env) === 'prod' ? 'prod' : 'test';
    if (!token) return json({ error: 'token required' }, 400);
    if (token.length < 20) return json({ error: 'token too short — paste the full KSeF token' }, 400);

    const encrypted = await encrypt(token, ENC_KEY);

    // Upsert — sprawdź czy rekord istnieje
    const check = await fetch(credUrl + '&select=tenant_id', { headers: sbHeaders });
    const exists = check.ok && (await check.json()).length > 0;

    const payload = { tenant_id: auth.tenantId, env, token_encrypted: encrypted, updated_at: new Date().toISOString() };
    const method  = exists ? 'PATCH' : 'POST';
    const url     = exists ? credUrl : `${SB_URL}/rest/v1/ksef_credentials`;
    const r2 = await fetch(url, { method, headers: sbHeaders, body: JSON.stringify(payload) });
    if (!r2.ok) return json({ error: 'failed to save', detail: await r2.text() }, 500);
    return json({ ok: true, env });
  }

  // ── DELETE: usuń token ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await fetch(credUrl, { method: 'DELETE', headers: sbHeaders });
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
}
