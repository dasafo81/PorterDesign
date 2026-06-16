// api/ksef/session.js  (v6 — Edge runtime, klucz już czysty PKCS#8 w bazie)
// token.js v3 odszyfrował ENCRYPTED PRIVATE KEY przy uploadzie.
// Tu tylko: AES-GCM decrypt → importKey(pkcs8) → sign → KSeF session.

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
const KSEF_URLS = {
  test: 'https://ksef-test.podatki.gov.pl/api',
  prod: 'https://ksef.podatki.gov.pl/api',
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
function jsonRes(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
  });
}

async function verifyUser(req) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return { ok: false, status: 500, message: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return { ok: false, status: 401, message: 'missing jwt' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

// AES-256-GCM decrypt
async function aesDecrypt(combined, hexKey) {
  function hexToBytes(h) {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i*2, i*2+2), 16);
    return a;
  }
  function b64ToBytes(b) { return Uint8Array.from(atob(b), c => c.charCodeAt(0)); }
  const [ivB64, ctB64] = combined.split(':');
  const key = await crypto.subtle.importKey('raw', hexToBytes(hexKey), { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB64) }, key, b64ToBytes(ctB64));
  return new TextDecoder().decode(dec);
}

// PEM → DER
function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// DER length helpers
function derLen(n) {
  if (n < 0x80) return new Uint8Array([n]);
  if (n < 0x100) return new Uint8Array([0x81, n]);
  return new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
}
function derTLV(tag, content) {
  const l = derLen(content.length);
  const out = new Uint8Array(1 + l.length + content.length);
  out[0] = tag; out.set(l, 1); out.set(content, 1 + l.length);
  return out;
}
function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// Import klucza prywatnego (RSA lub EC P-256) z PKCS#8 PEM
async function importPrivateKey(keyPem, keyType) {
  const der = pemToDer(keyPem);
  let pkcs8Der;

  if (keyPem.includes('BEGIN RSA PRIVATE KEY')) {
    // PKCS#1 RSA → opakuj w PKCS#8
    const oid = new Uint8Array([0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01]);
    const version = new Uint8Array([0x02,0x01,0x00]);
    const algId = derTLV(0x30, concat(derTLV(0x06, oid), new Uint8Array([0x05,0x00])));
    pkcs8Der = derTLV(0x30, concat(version, algId, derTLV(0x04, der)));
  } else {
    pkcs8Der = der;
  }

  const isEC = keyType === 'EC';
  return crypto.subtle.importKey(
    'pkcs8', pkcs8Der,
    isEC
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function signData(data, privateKey, keyType) {
  const isEC = keyType === 'EC';
  const alg = isEC
    ? { name: 'ECDSA', hash: 'SHA-256' }
    : 'RSASSA-PKCS1-v1_5';
  const sig = await crypto.subtle.sign(alg, privateKey, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY) return jsonRes({ error: 'KSEF_ENC_KEY not configured' }, 500);

  const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}` };

  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=cert_pem,key_encrypted,env,key_type`,
    { headers: sbH }
  );
  if (!credR.ok) return jsonRes({ error: 'Błąd odczytu credentials' }, 500);
  const creds = await credR.json();
  const cred = creds && creds[0];
  if (!cred || !cred.cert_pem || !cred.key_encrypted) {
    return jsonRes({ error: 'Brak certyfikatu. Usuń i wgraj ponownie przez Ustawienia → KSeF.' }, 400);
  }

  // Odszyfruj klucz (już czysty PKCS#8 PEM)
  let keyPem;
  try { keyPem = await aesDecrypt(cred.key_encrypted, ENC_KEY); }
  catch (e) { return jsonRes({ error: 'Błąd odszyfrowania klucza: ' + e.message }, 500); }

  // Import klucza RSA
  const keyType = cred.key_type || 'RSA';
  let privateKey;
  try { privateKey = await importPrivateKey(keyPem, keyType); }
  catch (e) { return jsonRes({ error: 'Błąd importu klucza RSA: ' + e.message }, 500); }

  // NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts && setts[0] && setts[0].seller_nip) || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) return jsonRes({ error: 'Brak NIP w ustawieniach.' }, 400);

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  // Krok 1: Challenge
  const chalR = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });
  if (!chalR.ok) return jsonRes({ error: 'KSeF Challenge failed', detail: await chalR.text() }, 502);
  const chal = await chalR.json();
  if (!chal.challenge) return jsonRes({ error: 'Brak challenge', detail: chal }, 502);

  // Krok 2: Podpis
  let signature;
  try { signature = await signData(chal.challenge + chal.timestamp, privateKey, keyType); }
  catch (e) { return jsonRes({ error: 'Błąd podpisywania: ' + e.message }, 500); }

  // Krok 3: Sesja
  const initR = await fetch(`${baseUrl}/online/Session/InitialisationSigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: { type: 'onip', identifier: nip },
      authorisationChallengeUtf8: chal.challenge,
      authorisationTimestampUtf8: chal.timestamp,
      keyIdentifier: { type: 'onip', identifier: nip },
      signatureInfo: { type: keyType === 'EC' ? 'ECDSA' : 'RSA', signature },
    }),
  });
  if (!initR.ok) return jsonRes({ error: 'KSeF InitialisationSigned failed', detail: await initR.text() }, 502);
  const init = await initR.json();
  const sessionToken = init.sessionToken && init.sessionToken.token;
  if (!sessionToken) return jsonRes({ error: 'Brak sessionToken', detail: init }, 502);

  return jsonRes({
    sessionToken,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    env: cred.env,
    baseUrl,
  });
}
