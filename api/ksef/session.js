// api/ksef/session.js
// Otwiera sesję interaktywną w KSeF i zwraca sessionToken (ważny ~1h).
// POST → { sessionToken, expiresAt }
//
// Środowiska KSeF:
//   test: https://ksef-test.podatki.gov.pl/api
//   prod: https://ksef.podatki.gov.pl/api
//
// Przepływ sesji interaktywnej (token KSeF):
//   POST /online/Session/AuthorisationChallenge  → challenge
//   POST /online/Session/InitialisationToken      → sessionToken

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
  if (!auth) return { ok: false, status: 401, message: 'missing token' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

async function decryptToken(encrypted, hexKey) {
  function hexToBytes(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return arr;
  }
  function b64ToBytes(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  const [ivB64, ctB64] = encrypted.split(':');
  const key = await crypto.subtle.importKey('raw', hexToBytes(hexKey), { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB64) }, key, b64ToBytes(ctB64));
  return new TextDecoder().decode(dec);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY) return json({ error: 'KSEF_ENC_KEY not configured' }, 500);

  // Pobierz credentiale z DB (service_role omija RLS na ksef_credentials)
  const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}` };
  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=token_encrypted,env`,
    { headers: sbH }
  );
  if (!credR.ok) return json({ error: 'db error fetching credentials' }, 500);
  const creds = await credR.json();
  const cred = creds && creds[0];
  if (!cred || !cred.token_encrypted) {
    return json({ error: 'Brak tokenu KSeF. Wejdź w Ustawienia → KSeF i wklej token.' }, 400);
  }

  // Odszyfruj token
  let ksefToken;
  try { ksefToken = await decryptToken(cred.token_encrypted, ENC_KEY); }
  catch (e) { return json({ error: 'Błąd odszyfrowania tokenu KSeF. Sprawdź KSEF_ENC_KEY.' }, 500); }

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  // Pobierz NIP tenanta z invoice_settings
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = (setts && setts[0] && setts[0].seller_nip || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) {
    return json({ error: 'Brak NIP w ustawieniach faktury. Uzupełnij dane sprzedawcy.' }, 400);
  }

  // Krok 1: AuthorisationChallenge
  const chalR = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });
  if (!chalR.ok) {
    const t = await chalR.text();
    return json({ error: 'KSeF AuthorisationChallenge failed', detail: t }, 502);
  }
  const chal = await chalR.json();
  const challenge = chal.challenge;
  const timestamp = chal.timestamp;
  if (!challenge) return json({ error: 'Brak challenge w odpowiedzi KSeF', detail: chal }, 502);

  // Krok 2: InitialisationToken — uwierzytelnienie tokenem
  // Struktura: token KSeF + challenge + timestamp → przekazujemy jako authorisationToken
  const initR = await fetch(`${baseUrl}/online/Session/InitialisationToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: { type: 'onip', identifier: nip },
      authorisationToken: ksefToken,
      challenge,
    }),
  });
  if (!initR.ok) {
    const t = await initR.text();
    return json({ error: 'KSeF InitialisationToken failed', detail: t }, 502);
  }
  const init = await initR.json();
  const sessionToken = init.sessionToken && init.sessionToken.token;
  if (!sessionToken) return json({ error: 'Brak sessionToken w odpowiedzi KSeF', detail: init }, 502);

  // sessionToken ważny ~1h — front cache'uje go w pamięci (nie w localStorage)
  const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  return json({ sessionToken, expiresAt, env: cred.env, baseUrl });
}
