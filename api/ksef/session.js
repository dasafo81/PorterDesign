// api/ksef/session.js  (v4  — Node.js runtime, konwencja req/res)
import nodeCrypto from 'crypto';

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
const KSEF_URLS = {
  test: 'https://ksef-test.podatki.gov.pl/api',
  prod: 'https://ksef.podatki.gov.pl/api',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function sendJson(res, data, status) {
  res.status(status || 200).json(data);
}

async function verifyUser(req) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return { ok: false, status: 500, message: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, message: 'missing jwt' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

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

function signRSA(data, keyPem, passphrase) {
  const keyObj = nodeCrypto.createPrivateKey({
    key: keyPem,
    format: 'pem',
    passphrase: passphrase || '',
  });
  return nodeCrypto.sign('sha256', Buffer.from(data, 'utf8'), {
    key: keyObj,
    padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
  }).toString('base64');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { sendJson(res, { error: 'POST only' }, 405); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { sendJson(res, { error: auth.message }, auth.status); return; }

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY) { sendJson(res, { error: 'KSEF_ENC_KEY not configured' }, 500); return; }

  const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}` };

  // Pobierz certyfikat
  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=cert_pem,key_encrypted,cert_pass_enc,env`,
    { headers: sbH }
  );
  if (!credR.ok) { sendJson(res, { error: 'Błąd odczytu credentials z DB' }, 500); return; }
  const creds = await credR.json();
  const cred = creds && creds[0];
  if (!cred || !cred.cert_pem || !cred.key_encrypted) {
    sendJson(res, { error: 'Brak certyfikatu KSeF. Wejdź w Ustawienia → KSeF i wgraj pliki .crt i .key.' }, 400);
    return;
  }

  // Odszyfruj klucz
  let keyPem;
  try { keyPem = await aesDecrypt(cred.key_encrypted, ENC_KEY); }
  catch (e) { sendJson(res, { error: 'Błąd odszyfrowania klucza: ' + e.message }, 500); return; }

  // Hasło do klucza
  let keyPass = '';
  if (cred.cert_pass_enc) {
    try { keyPass = await aesDecrypt(cred.cert_pass_enc, ENC_KEY); } catch (e) { keyPass = ''; }
  }

  // NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts && setts[0] && setts[0].seller_nip) || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) {
    sendJson(res, { error: 'Brak NIP w ustawieniach faktury.' }, 400); return;
  }

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  // Krok 1: AuthorisationChallenge
  const chalR = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });
  if (!chalR.ok) {
    sendJson(res, { error: 'KSeF AuthorisationChallenge failed', detail: await chalR.text() }, 502); return;
  }
  const chal = await chalR.json();
  if (!chal.challenge) {
    sendJson(res, { error: 'Brak challenge w odpowiedzi KSeF', detail: chal }, 502); return;
  }

  // Krok 2: Podpis RSA-SHA256
  let signature;
  try { signature = signRSA(chal.challenge + chal.timestamp, keyPem, keyPass); }
  catch (e) { sendJson(res, { error: 'Błąd podpisywania RSA: ' + e.message }, 500); return; }

  // Krok 3: InitialisationSigned
  const initR = await fetch(`${baseUrl}/online/Session/InitialisationSigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: { type: 'onip', identifier: nip },
      authorisationChallengeUtf8: chal.challenge,
      authorisationTimestampUtf8: chal.timestamp,
      keyIdentifier: { type: 'onip', identifier: nip },
      signatureInfo: { type: 'RSA', signature },
    }),
  });
  if (!initR.ok) {
    sendJson(res, { error: 'KSeF InitialisationSigned failed', detail: await initR.text() }, 502); return;
  }
  const init = await initR.json();
  const sessionToken = init.sessionToken && init.sessionToken.token;
  if (!sessionToken) {
    sendJson(res, { error: 'Brak sessionToken w odpowiedzi KSeF', detail: init }, 502); return;
  }

  sendJson(res, {
    sessionToken,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    env: cred.env,
    baseUrl,
  });
}
