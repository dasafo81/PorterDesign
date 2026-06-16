// api/ksef/session.js — KSeF API 2.0 (v2.6.1)
// Przepływ uwierzytelniania certyfikatem KSeF (XAdES/ksef-token):
//   Dla certyfikatu KSeF: POST /auth/ksef-token
//     → accessToken JWT + referenceNumber
//     → GET /auth/{referenceNumber} (polling aż status 200)
//     → POST /auth/token/redeem → accessToken + refreshToken
//
// Zwraca: { accessToken, refreshToken, env, baseUrl }
// Front cache'uje accessToken w pamięci (ważny ~15 min)

export const config = { runtime: 'edge' };

const KSEF_URLS = {
  test: 'https://api-test.ksef.mf.gov.pl/v2',
  prod: 'https://api.ksef.mf.gov.pl/v2',
};
const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

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
  const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SVC) return { ok: false, status: 500, message: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return { ok: false, status: 401, message: 'missing jwt' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SVC, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const u = await r.json();
  const tid = u && u.app_metadata && u.app_metadata.tenant_id;
  if (!tid) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId: tid, service: SVC };
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
  return Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    c => c.charCodeAt(0)
  );
}

// Import klucza EC P-256 lub RSA z PKCS#8 PEM
async function importPrivateKey(keyPem, keyType) {
  const der = pemToDer(keyPem);
  const isEC = (keyType || '').toUpperCase() === 'EC';
  return crypto.subtle.importKey(
    'pkcs8', der,
    isEC ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

// Pobierz klucz publiczny KSeF (RSA-OAEP) do szyfrowania tokenu
async function getKsefPublicKey(baseUrl) {
  const r = await fetch(`${baseUrl}/security/public-key-certificates`);
  if (!r.ok) throw new Error('Błąd pobierania klucza publicznego KSeF: HTTP ' + r.status);
  const data = await r.json();
  // Szukamy klucza do szyfrowania (KsefTokenEncryption lub pierwszy aktywny)
  const certs = data.certificates || data.items || [];
  const cert = certs.find(c => c.type === 'KsefTokenEncryption' || c.usage === 'Encryption') || certs[0];
  if (!cert) throw new Error('Brak klucza publicznego KSeF w odpowiedzi');
  // Certyfikat w formacie PEM lub DER base64
  const certPem = cert.certificate || cert.publicKey || cert.value;
  const certId = cert.id || cert.publicKeyId || null;
  return { certPem, certId };
}

// Importuj klucz publiczny RSA z certyfikatu X.509 DER lub PEM
async function importRSAPublicKey(certPemOrDer) {
  // Próbuj jako PEM certyfikatu X.509
  let der;
  if (certPemOrDer.includes('BEGIN CERTIFICATE') || certPemOrDer.includes('BEGIN PUBLIC KEY')) {
    der = pemToDer(certPemOrDer);
  } else {
    // Base64 bez nagłówków
    der = Uint8Array.from(atob(certPemOrDer), c => c.charCodeAt(0));
  }

  // Próba importu jako SubjectPublicKeyInfo (BEGIN PUBLIC KEY)
  try {
    return await crypto.subtle.importKey(
      'spki', der,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false, ['encrypt']
    );
  } catch (e) {
    // Może być certyfikat X.509 — wyciągnij SubjectPublicKeyInfo
    // X.509 TBSCertificate zawiera subjectPublicKeyInfo gdzieś w środku
    // Parsujemy uproszczenie: szukamy sekwencji RSA OID
    throw new Error('Nie można zaimportować klucza publicznego KSeF: ' + e.message);
  }
}

// Szyfruj token KSeF: RSA-OAEP(token + | + timestampMs)
async function encryptToken(ksefToken, timestampMs, publicKey) {
  const data = new TextEncoder().encode(ksefToken + '|' + timestampMs);
  const enc = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(enc)));
}

// Polling statusu uwierzytelnienia
async function pollAuthStatus(baseUrl, referenceNumber, accessToken, maxAttempts) {
  for (let i = 0; i < (maxAttempts || 10); i++) {
    await new Promise(r => setTimeout(r, 2000)); // 2s między próbami
    const r = await fetch(`${baseUrl}/auth/${referenceNumber}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) continue;
    const d = await r.json();
    const code = d.status && d.status.code;
    if (code === 200) return { ok: true, data: d };
    if (code === 450 || code === 400) return { ok: false, error: 'Uwierzytelnianie nieudane: ' + (d.status && d.status.description) };
  }
  return { ok: false, error: 'Timeout oczekiwania na uwierzytelnianie KSeF' };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY) return jsonRes({ error: 'KSEF_ENC_KEY not configured' }, 500);

  const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}` };

  // Pobierz credentials
  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=cert_pem,key_encrypted,env,key_type,token_encrypted`,
    { headers: sbH }
  );
  if (!credR.ok) return jsonRes({ error: 'Błąd odczytu credentials' }, 500);
  const creds = await credR.json();
  const cred = creds && creds[0];
  if (!cred) return jsonRes({ error: 'Brak certyfikatu KSeF. Wejdź w Ustawienia → KSeF i wgraj pliki.' }, 400);

  // Pobierz NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts && setts[0] && setts[0].seller_nip) || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) return jsonRes({ error: 'Brak NIP w ustawieniach faktury.' }, 400);

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  // ── Ścieżka A: Token KSeF (jeśli zapisany) ───────────────────────────────
  if (cred.token_encrypted) {
    let ksefToken;
    try { ksefToken = await aesDecrypt(cred.token_encrypted, ENC_KEY); }
    catch (e) { return jsonRes({ error: 'Błąd odszyfrowania tokenu KSeF' }, 500); }

    // Pobierz klucz publiczny KSeF
    let pubKeyData;
    try { pubKeyData = await getKsefPublicKey(baseUrl); }
    catch (e) { return jsonRes({ error: e.message }, 502); }

    let pubKey;
    try { pubKey = await importRSAPublicKey(pubKeyData.certPem); }
    catch (e) { return jsonRes({ error: 'Błąd importu klucza publicznego KSeF: ' + e.message }, 500); }

    const timestampMs = Date.now().toString();
    let encryptedToken;
    try { encryptedToken = await encryptToken(ksefToken, timestampMs, pubKey); }
    catch (e) { return jsonRes({ error: 'Błąd szyfrowania tokenu: ' + e.message }, 500); }

    const body = {
      contextIdentifier: { type: 'onip', identifier: nip },
      encryptedToken,
      encryptedTimestampMs: timestampMs,
    };
    if (pubKeyData.certId) body.publicKeyId = pubKeyData.certId;

    const authR = await fetch(`${baseUrl}/auth/ksef-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!authR.ok) return jsonRes({ error: 'KSeF /auth/ksef-token failed', detail: await authR.text() }, 502);
    const authData = await authR.json();
    const { authenticationToken, referenceNumber } = authData;

    // Polling statusu
    const poll = await pollAuthStatus(baseUrl, referenceNumber, authenticationToken, 8);
    if (!poll.ok) return jsonRes({ error: poll.error }, 502);

    // Redeem → accessToken + refreshToken
    const redeemR = await fetch(`${baseUrl}/auth/token/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authenticationToken}` },
      body: JSON.stringify({ referenceNumber }),
    });
    if (!redeemR.ok) return jsonRes({ error: 'KSeF /auth/token/redeem failed', detail: await redeemR.text() }, 502);
    const tokens = await redeemR.json();

    return jsonRes({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(), // ~14 min
      env: cred.env,
      baseUrl,
    });
  }

  // ── Ścieżka B: Certyfikat KSeF (XAdES) ───────────────────────────────────
  // Certyfikat KSeF = certyfikat wewnętrzny MF — uwierzytelnianie przez /auth/xades-signature
  // Wymaga podpisania XML AuthTokenRequest w formacie XAdES
  // XAdES jest bardzo złożone — na razie zwracamy informację że potrzebny token KSeF

  if (!cred.key_encrypted) {
    return jsonRes({ error: 'Brak klucza prywatnego. Wgraj certyfikat przez Ustawienia → KSeF.' }, 400);
  }

  // Odszyfruj klucz
  let keyPem;
  try { keyPem = await aesDecrypt(cred.key_encrypted, ENC_KEY); }
  catch (e) { return jsonRes({ error: 'Błąd odszyfrowania klucza: ' + e.message }, 500); }

  const keyType = ((cred.key_type || 'EC').toUpperCase() === 'EC') ? 'EC' : 'RSA';

  let privateKey;
  try { privateKey = await importPrivateKey(keyPem, keyType); }
  catch (e) { return jsonRes({ error: 'Błąd importu klucza: ' + e.message }, 500); }

  // Generuj AuthTokenRequest XML (schema 2.1)
  const timestampMs = Date.now().toString();
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/auth/request/2021/10/01/0001" xmlns:etd="http://ksef.mf.gov.pl/schema/etd/2021/10/01/0001" schemaVersion="2.1">
  <Context>
    <Identifier xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="etd:SubjectIdentifierByCompanyType">
      <etd:Identifier>${nip}</etd:Identifier>
    </Identifier>
    <DocumentType>
      <etd:Service>KSeF</etd:Service>
      <etd:FormCode>
        <etd:SystemCode>FA (3)</etd:SystemCode>
        <etd:SchemaVersion>1-0E</etd:SchemaVersion>
        <etd:TargetNamespace>http://ksef.mf.gov.pl/schema/gtw/svc/types</etd:TargetNamespace>
        <etd:Value>FA</etd:Value>
      </etd:FormCode>
    </DocumentType>
  </Context>
</AuthTokenRequest>`;

  // Podpisz XML — dla certyfikatu KSeF EC/RSA używamy prostego podpisu
  // (pełny XAdES enveloped wymaga transformacji, ale KSeF akceptuje też enveloping)
  const isEC = keyType === 'EC';
  const xmlBytes = new TextEncoder().encode(xmlBody);
  let sigBytes;
  try {
    sigBytes = await crypto.subtle.sign(
      isEC ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5',
      privateKey, xmlBytes
    );
  } catch (e) { return jsonRes({ error: 'Błąd podpisywania: ' + e.message }, 500); }

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  const certB64 = cred.cert_pem
    ? cred.cert_pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    : '';

  // XAdES enveloping — XML z podpisem
  const xadesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  <SignedInfo>
    <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <SignatureMethod Algorithm="${isEC ? 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' : 'http://www.w3.org/2000/09/xmldsig#rsa-sha256'}"/>
    <Reference URI="#AuthTokenRequest">
      <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <DigestValue>${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', xmlBytes))))}</DigestValue>
    </Reference>
  </SignedInfo>
  <SignatureValue>${sigB64}</SignatureValue>
  <KeyInfo>
    <X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>
  </KeyInfo>
  <Object Id="AuthTokenRequest">${xmlBody.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}</Object>
</Signature>`;

  const xadesB64 = btoa(unescape(encodeURIComponent(xadesXml)));

  const authR = await fetch(`${baseUrl}/auth/xades-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextIdentifier: { type: 'onip', identifier: nip },
      signedDocument: xadesB64,
    }),
  });
  if (!authR.ok) {
    const errText = await authR.text();
    return jsonRes({ error: 'KSeF /auth/xades-signature failed HTTP ' + authR.status, detail: errText }, 502);
  }
  const authData = await authR.json();
  const { authenticationToken, referenceNumber } = authData;
  if (!authenticationToken) return jsonRes({ error: 'Brak authenticationToken', detail: authData }, 502);

  // Polling
  const poll = await pollAuthStatus(baseUrl, referenceNumber, authenticationToken, 8);
  if (!poll.ok) return jsonRes({ error: poll.error }, 502);

  // Redeem
  const redeemR = await fetch(`${baseUrl}/auth/token/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authenticationToken}` },
    body: JSON.stringify({ referenceNumber }),
  });
  if (!redeemR.ok) return jsonRes({ error: 'KSeF /auth/token/redeem failed', detail: await redeemR.text() }, 502);
  const tokens = await redeemR.json();

  return jsonRes({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
    env: cred.env,
    baseUrl,
  });
}
