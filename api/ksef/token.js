// api/ksef/token.js  (v2 — certyfikat zamiast tokenu)
// Zarządza certyfikatem KSeF per tenant.
// GET    → { hasCert, env, updated_at }
// POST   → przyjmuje { certPem, keyPem, keyPass, env }
//           certPem i keyPem to zawartość plików .crt / .key w formacie PEM (text)
//           keyPem jest szyfrowane AES-256-GCM kluczem KSEF_ENC_KEY przed zapisem
// DELETE → usuwa certyfikat tenanta
//
// KSEF_ENC_KEY — 64-znakowy hex (32 bajty), dodaj w Vercel → Settings → Env Vars:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

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

// AES-256-GCM encrypt → "iv:ciphertext" (obie części base64, separator ":")
async function encrypt(plain, hexKey) {
  const keyBytes = hexToBytes(hexKey);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return b64(iv) + ':' + b64(new Uint8Array(enc));
}

function hexToBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return a;
}
function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY || ENC_KEY.length !== 64) {
    return json({ error: 'KSEF_ENC_KEY not configured. Dodaj 64-znakowy hex w Vercel → Env Vars.' }, 500);
  }

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const credUrl = `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}`;

  // ── GET: status certyfikatu ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(credUrl + '&select=tenant_id,env,updated_at,cert_pem', { headers: sbH });
    if (!r.ok) return json({ error: 'db error' }, 500);
    const rows = await r.json();
    const row = rows && rows[0];
    return json({
      hasCert: !!(row && row.cert_pem),
      env: row ? row.env : 'test',
      updated_at: row ? row.updated_at : null,
    });
  }

  // ── POST: zapisz certyfikat ───────────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }

    const certPem = (body && body.certPem || '').trim();
    const keyPem  = (body && body.keyPem  || '').trim();
    const keyPass = (body && body.keyPass || '');   // hasło do klucza (opcjonalne)
    const env     = (body && body.env) === 'prod' ? 'prod' : 'test';

    if (!certPem) return json({ error: 'certPem wymagany (zawartość pliku .crt)' }, 400);
    if (!keyPem)  return json({ error: 'keyPem wymagany (zawartość pliku .key)' }, 400);

    // Walidacja formatu PEM
    if (!certPem.includes('-----BEGIN CERTIFICATE-----')) {
      return json({ error: 'Nieprawidłowy format certyfikatu — oczekiwano PEM (-----BEGIN CERTIFICATE-----)' }, 400);
    }
    if (!keyPem.includes('-----BEGIN') || !keyPem.includes('PRIVATE KEY')) {
      return json({ error: 'Nieprawidłowy format klucza — oczekiwano PEM (-----BEGIN ... PRIVATE KEY-----)' }, 400);
    }

    // Zaszyfruj klucz prywatny i (opcjonalne) hasło
    const keyEncrypted  = await encrypt(keyPem,  ENC_KEY);
    const passEncrypted = keyPass ? await encrypt(keyPass, ENC_KEY) : null;

    // Upsert
    const check  = await fetch(credUrl + '&select=tenant_id', { headers: sbH });
    const exists = check.ok && (await check.json()).length > 0;

    const payload = {
      tenant_id:       auth.tenantId,
      env,
      cert_pem:        certPem,       // certyfikat .crt nie jest sekretem — można trzymać plain
      key_encrypted:   keyEncrypted,  // klucz prywatny — szyfrowany
      cert_pass_enc:   passEncrypted, // hasło — szyfrowane (null jeśli brak)
      token_encrypted: null,          // wyczyść stary token jeśli był
      updated_at:      new Date().toISOString(),
    };

    const method = exists ? 'PATCH' : 'POST';
    const url    = exists ? credUrl : `${SB_URL}/rest/v1/ksef_credentials`;
    const r2 = await fetch(url, { method, headers: sbH, body: JSON.stringify(payload) });
    if (!r2.ok) return json({ error: 'Błąd zapisu w DB', detail: await r2.text() }, 500);
    return json({ ok: true, env });
  }

  // ── DELETE: usuń certyfikat ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await fetch(credUrl, { method: 'DELETE', headers: sbH });
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
}
