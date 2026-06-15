// api/ksef/session.js  (v2 — uwierzytelnienie certyfikatem)
// Otwiera sesję interaktywną w KSeF używając certyfikatu KSeF (nie tokenu).
// POST → { sessionToken, expiresAt, env, baseUrl }
//
// Przepływ uwierzytelnienia certyfikatem (KSeF 2.0):
//   1. POST /online/Session/AuthorisationChallenge → { challenge, timestamp }
//   2. Podpisz SHA-256(challenge + timestamp) kluczem prywatnym certyfikatu (RSA-SHA256)
//   3. POST /online/Session/InitialisationSigned → { sessionToken }
//
// Vercel Edge Runtime obsługuje Web Crypto API (crypto.subtle) w pełni.
// PEM → importKey: usuwamy nagłówki PEM i dekodujemy base64 → DER.

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
  if (!auth) return { ok: false, status: 401, message: 'missing jwt' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

// AES-256-GCM decrypt ← "iv:ct" (base64)
async function aesDecrypt(combined, hexKey) {
  function hexToBytes(h) {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return a;
  }
  function b64ToBytes(b) { return Uint8Array.from(atob(b), c => c.charCodeAt(0)); }
  const [ivB64, ctB64] = combined.split(':');
  const key = await crypto.subtle.importKey('raw', hexToBytes(hexKey), { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB64) }, key, b64ToBytes(ctB64));
  return new TextDecoder().decode(dec);
}

// PEM (z nagłówkami BEGIN/END) → Uint8Array (DER/binary)
function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Importuj klucz prywatny RSA z PEM (PKCS#8 lub PKCS#1)
// KSeF wymaga RSA-SHA256 (RSASSA-PKCS1-v1_5)
async function importPrivateKey(keyPem) {
  const der = pemToDer(keyPem);

  // Próba PKCS#8 (-----BEGIN PRIVATE KEY----- lub -----BEGIN RSA PRIVATE KEY-----)
  // Web Crypto importuje PKCS#8 bezpośrednio.
  // Jeśli plik jest PKCS#1 (-----BEGIN RSA PRIVATE KEY-----), owijamy go w PKCS#8.
  const isPkcs8 = keyPem.includes('BEGIN PRIVATE KEY');

  if (isPkcs8) {
    return crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } else {
    // PKCS#1 → musimy opakować w PKCS#8 wrapper
    // PKCS#8 wrapper dla RSA: sekwencja ASN.1 z OID rsaEncryption + OCTET STRING(PKCS#1)
    const pkcs8Header = new Uint8Array([
      0x30, 0x82, 0x00, 0x00,  // SEQUENCE (długość patch-owana poniżej)
        0x02, 0x01, 0x00,        // INTEGER version = 0
        0x30, 0x0d,              // SEQUENCE (AlgorithmIdentifier)
          0x06, 0x09,            // OID rsaEncryption
          0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
          0x05, 0x00,            // NULL
        0x04, 0x82, 0x00, 0x00, // OCTET STRING (długość patch-owana poniżej)
    ]);
    const totalInner = pkcs8Header.length - 4 + der.length;  // bez outer SEQUENCE header
    const totalOuter = totalInner + 4;

    // Patch długości OCTET STRING
    pkcs8Header[pkcs8Header.length - 2] = (der.length >> 8) & 0xff;
    pkcs8Header[pkcs8Header.length - 1] = der.length & 0xff;

    // Patch długości outer SEQUENCE
    pkcs8Header[2] = (totalInner >> 8) & 0xff;
    pkcs8Header[3] = totalInner & 0xff;

    const pkcs8 = new Uint8Array(totalOuter);
    pkcs8.set(pkcs8Header, 0);
    pkcs8.set(der, pkcs8Header.length);

    return crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
}

// Podpisz dane kluczem prywatnym → base64
async function signData(data, privateKey) {
  const buf = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, buf);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY) return json({ error: 'KSEF_ENC_KEY not configured' }, 500);

  // Pobierz certyfikat z DB (service_role omija RLS na ksef_credentials)
  const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}` };
  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=cert_pem,key_encrypted,cert_pass_enc,env`,
    { headers: sbH }
  );
  if (!credR.ok) return json({ error: 'Błąd odczytu credentials z DB' }, 500);
  const creds = await credR.json();
  const cred = creds && creds[0];

  if (!cred || !cred.cert_pem || !cred.key_encrypted) {
    return json({ error: 'Brak certyfikatu KSeF. Wejdź w Ustawienia → KSeF i wgraj pliki .crt i .key.' }, 400);
  }

  // Odszyfruj klucz prywatny
  let keyPem;
  try { keyPem = await aesDecrypt(cred.key_encrypted, ENC_KEY); }
  catch (e) { return json({ error: 'Błąd odszyfrowania klucza prywatnego. Sprawdź KSEF_ENC_KEY.' }, 500); }

  // Importuj klucz prywatny do Web Crypto
  let privateKey;
  try { privateKey = await importPrivateKey(keyPem); }
  catch (e) { return json({ error: 'Błąd importu klucza prywatnego RSA: ' + e.message }, 500); }

  // Pobierz NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts && setts[0] && setts[0].seller_nip) || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) {
    return json({ error: 'Brak NIP w ustawieniach faktury. Uzupełnij dane sprzedawcy.' }, 400);
  }

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  // Krok 1: AuthorisationChallenge
  const chalR = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });
  if (!chalR.ok) {
    return json({ error: 'KSeF AuthorisationChallenge failed', detail: await chalR.text() }, 502);
  }
  const chal = await chalR.json();
  const challenge  = chal.challenge;
  const timestamp  = chal.timestamp;
  if (!challenge) return json({ error: 'Brak challenge w odpowiedzi KSeF', detail: chal }, 502);

  // Krok 2: Podpisz (challenge + timestamp) kluczem prywatnym
  // KSeF 2.0: podpisywany ciąg = challenge || timestamp (konkatenacja bez separatora)
  const dataToSign = challenge + timestamp;
  let signature;
  try { signature = await signData(dataToSign, privateKey); }
  catch (e) { return json({ error: 'Błąd podpisywania challenge: ' + e.message }, 500); }

  // Krok 3: InitialisationSigned — sesja przez certyfikat
  const initR = await fetch(`${baseUrl}/online/Session/InitialisationSigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: { type: 'onip', identifier: nip },
      authorisationChallengeUtf8:  challenge,
      authorisationTimestampUtf8:  timestamp,
      keyIdentifier: {
        type:  'onip',
        identifier: nip,
      },
      signatureInfo: {
        type:      'RSA',
        signature: signature,
      },
    }),
  });

  if (!initR.ok) {
    const t = await initR.text();
    return json({ error: 'KSeF InitialisationSigned failed', detail: t }, 502);
  }
  const init = await initR.json();
  const sessionToken = init.sessionToken && init.sessionToken.token;
  if (!sessionToken) return json({ error: 'Brak sessionToken w odpowiedzi KSeF', detail: init }, 502);

  const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  return json({ sessionToken, expiresAt, env: cred.env, baseUrl });
}
