// api/ksef/session.js  (v3 — Node.js runtime, obsługa ENCRYPTED PRIVATE KEY)
// Node.js runtime ma pełne crypto API — obsługuje PKCS#1, PKCS#8, ENCRYPTED PRIVATE KEY.

// WAŻNE: brak "export const config = { runtime: 'edge' }"
// → Vercel używa Node.js runtime automatycznie

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
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` },
  });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

// AES-256-GCM decrypt (identyczne z token.js)
async function aesDecrypt(combined, hexKey) {
  function hexToBytes(h) {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return a;
  }
  function b64ToBytes(b) { return Uint8Array.from(atob(b), c => c.charCodeAt(0)); }
  const [ivB64, ctB64] = combined.split(':');
  const key = await crypto.subtle.importKey('raw', hexToBytes(hexKey), { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(ctB64)
  );
  return new TextDecoder().decode(dec);
}

// Podpisz dane kluczem prywatnym RSA-SHA256 → base64
// Node.js crypto obsługuje wszystkie formaty PEM natywnie
function signWithNodeCrypto(data, keyPem, passphrase) {
  const nodeCrypto = require('crypto');
  const keyObj = nodeCrypto.createPrivateKey({
    key: keyPem,
    format: 'pem',
    passphrase: passphrase || '',
  });
  const sig = nodeCrypto.sign('sha256', Buffer.from(data, 'utf8'), {
    key: keyObj,
    padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
  });
  return sig.toString('base64');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY) return jsonRes({ error: 'KSEF_ENC_KEY not configured' }, 500);

  // Pobierz certyfikat z DB
  const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}` };
  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=cert_pem,key_encrypted,cert_pass_enc,env`,
    { headers: sbH }
  );
  if (!credR.ok) return jsonRes({ error: 'Błąd odczytu credentials z DB' }, 500);
  const creds = await credR.json();
  const cred = creds && creds[0];
  if (!cred || !cred.cert_pem || !cred.key_encrypted) {
    return jsonRes({ error: 'Brak certyfikatu KSeF. Wejdź w Ustawienia → KSeF i wgraj pliki .crt i .key.' }, 400);
  }

  // Odszyfruj klucz prywatny (AES)
  let keyPem;
  try { keyPem = await aesDecrypt(cred.key_encrypted, ENC_KEY); }
  catch (e) { return jsonRes({ error: 'Błąd odszyfrowania klucza: ' + e.message }, 500); }

  // Odszyfruj hasło do klucza (jeśli było ustawione)
  let keyPass = '';
  if (cred.cert_pass_enc) {
    try { keyPass = await aesDecrypt(cred.cert_pass_enc, ENC_KEY); }
    catch (e) { keyPass = ''; }
  }

  // Pobierz NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts && setts[0] && setts[0].seller_nip) || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) {
    return jsonRes({ error: 'Brak NIP w ustawieniach faktury. Uzupełnij dane sprzedawcy.' }, 400);
  }

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  // Krok 1: AuthorisationChallenge
  const chalR = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });
  if (!chalR.ok) {
    return jsonRes({ error: 'KSeF AuthorisationChallenge failed', detail: await chalR.text() }, 502);
  }
  const chal = await chalR.json();
  const challenge = chal.challenge;
  const timestamp = chal.timestamp;
  if (!challenge) return jsonRes({ error: 'Brak challenge w odpowiedzi KSeF', detail: chal }, 502);

  // Krok 2: Podpisz challenge+timestamp kluczem prywatnym RSA-SHA256
  let signature;
  try {
    signature = signWithNodeCrypto(challenge + timestamp, keyPem, keyPass);
  } catch (e) {
    return jsonRes({ error: 'Błąd podpisywania RSA: ' + e.message }, 500);
  }

  // Krok 3: InitialisationSigned
  const initR = await fetch(`${baseUrl}/online/Session/InitialisationSigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: { type: 'onip', identifier: nip },
      authorisationChallengeUtf8: challenge,
      authorisationTimestampUtf8: timestamp,
      keyIdentifier: { type: 'onip', identifier: nip },
      signatureInfo: { type: 'RSA', signature },
    }),
  });

  if (!initR.ok) {
    const t = await initR.text();
    return jsonRes({ error: 'KSeF InitialisationSigned failed', detail: t }, 502);
  }
  const init = await initR.json();
  const sessionToken = init.sessionToken && init.sessionToken.token;
  if (!sessionToken) return jsonRes({ error: 'Brak sessionToken w odpowiedzi KSeF', detail: init }, 502);

  const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  return jsonRes({ sessionToken, expiresAt, env: cred.env, baseUrl });
}
