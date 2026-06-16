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

  // ── Ścieżka A: Token KSeF ─────────────────────────────────────────────────
  // Flow: GET /security/public-key-certificates → POST /auth/challenge
  //   → RSA-OAEP(token|timestampMs, pubKey) → POST /auth/ksef-token
  //   → poll GET /auth/{ref} → POST /auth/token/redeem → accessToken
  if (cred.token_encrypted) {
    // 1. Odszyfruj token KSeF
    let ksefToken;
    try { ksefToken = await aesDecrypt(cred.token_encrypted, ENC_KEY); }
    catch (e) { return jsonRes({ error: 'Błąd odszyfrowania tokenu KSeF: ' + e.message }, 500); }

    // 2. Pobierz certyfikaty publiczne KSeF
    let pubCertsR;
    try { pubCertsR = await fetch(baseUrl + '/security/public-key-certificates'); }
    catch (e) { return jsonRes({ error: 'Błąd sieci do KSeF: ' + e.message }, 502); }
    if (!pubCertsR.ok) return jsonRes({ error: 'KSeF /security/public-key-certificates HTTP ' + pubCertsR.status }, 502);
    const pubCertsData = await pubCertsR.json();
    console.log('pub-key-certs response:', JSON.stringify(pubCertsData).slice(0, 400));

    // Znajdź certyfikat do szyfrowania tokenu (KsefTokenEncryption)
    const certs = pubCertsData.certificates || pubCertsData.items || pubCertsData.data || (Array.isArray(pubCertsData) ? pubCertsData : []);
    const tokenEncCert = certs.find(c =>
      (c.usage && (c.usage.includes('KsefTokenEncryption') || c.usage === 'KsefTokenEncryption')) ||
      (c.type && c.type === 'KsefTokenEncryption')
    ) || certs[0];
    if (!tokenEncCert) return jsonRes({ error: 'Brak certyfikatu KsefTokenEncryption w odpowiedzi KSeF', detail: pubCertsData }, 502);

    // 3. Importuj klucz publiczny RSA (X.509 DER lub PEM)
    const certPemOrB64 = tokenEncCert.certificate || tokenEncCert.publicKey || tokenEncCert.value || tokenEncCert.pem || '';
    const certId = tokenEncCert.id || tokenEncCert.publicKeyId || tokenEncCert.fingerprint || null;

    let pubKey;
    try {
      // Konwertuj certyfikat X.509 → SubjectPublicKeyInfo dla Web Crypto
      // Certyfikat KSeF to X.509 w formacie PEM lub base64 DER
      const certDerB64 = certPemOrB64.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
      const certDer = Uint8Array.from(atob(certDerB64), c => c.charCodeAt(0));

      // Próba importu jako SubjectPublicKeyInfo (BEGIN PUBLIC KEY)
      try {
        pubKey = await crypto.subtle.importKey(
          'spki', certDer,
          { name: 'RSA-OAEP', hash: { name: 'SHA-256' } },
          false, ['encrypt']
        );
      } catch (spkiErr) {
        // Może być certyfikat X.509 — wyciągnij SPKI z TBSCertificate
        // X.509: SEQUENCE { TBSCertificate { ... subjectPublicKeyInfo ... } }
        // Szukamy sekwencji RSA OID (2a 86 48 86 f7 0d 01 01 01) w DER
        const rsaOid = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
        let spkiStart = -1;
        for (let i = 0; i < certDer.length - rsaOid.length; i++) {
          if (rsaOid.every((b, j) => certDer[i+j] === b)) {
            // Znaleziono OID — SPKI SEQUENCE zaczyna się 2 bajty wcześniej (tag + len)
            // Cofamy się do początku SEQUENCE zawierającej ten OID
            spkiStart = i - 2;
            // Sprawdź czy to SEQUENCE (0x30)
            while (spkiStart > 0 && certDer[spkiStart] !== 0x30) spkiStart--;
            break;
          }
        }
        if (spkiStart < 0) throw new Error('Nie znaleziono RSA OID w certyfikacie');
        // Wyciągnij SPKI SEQUENCE
        let spkiLen = certDer[spkiStart + 1];
        let spkiOff = 2;
        if (spkiLen & 0x80) {
          const nb = spkiLen & 0x7f;
          spkiLen = 0;
          for (let k = 0; k < nb; k++) spkiLen = (spkiLen << 8) | certDer[spkiStart + 2 + k];
          spkiOff = 2 + nb;
        }
        const spkiDer = certDer.slice(spkiStart, spkiStart + spkiOff + spkiLen);
        pubKey = await crypto.subtle.importKey(
          'spki', spkiDer,
          { name: 'RSA-OAEP', hash: { name: 'SHA-256' } },
          false, ['encrypt']
        );
      }
    } catch (e) {
      return jsonRes({ error: 'Błąd importu klucza publicznego KSeF: ' + e.message }, 500);
    }

    // 4. POST /auth/challenge
    let chalR2;
    try { chalR2 = await fetch(baseUrl + '/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
    }); } catch (e) { return jsonRes({ error: 'Błąd sieci /auth/challenge: ' + e.message }, 502); }
    if (!chalR2.ok) return jsonRes({ error: 'KSeF /auth/challenge HTTP ' + chalR2.status, detail: await chalR2.text() }, 502);
    const chalData2 = await chalR2.json();
    const challenge2 = chalData2.challenge;
    const timestampMs = chalData2.timestampMs || Date.now().toString();
    if (!challenge2) return jsonRes({ error: 'Brak challenge w /auth/challenge', detail: chalData2 }, 502);

    // 5. Szyfruj token: RSA-OAEP(token|timestampMs, pubKey)
    let encryptedToken;
    try {
      const plaintext = new TextEncoder().encode(ksefToken + '|' + timestampMs);
      const encBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, plaintext);
      encryptedToken = btoa(String.fromCharCode(...new Uint8Array(encBuf)));
    } catch (e) { return jsonRes({ error: 'Błąd szyfrowania tokenu RSA-OAEP: ' + e.message }, 500); }

    // 6. POST /auth/ksef-token
    const ksefTokenBody = {
      contextIdentifier: { type: 'onip', identifier: nip },
      challenge: challenge2,
      encryptedToken,
    };
    if (certId) ksefTokenBody.publicKeyId = certId;

    let authR;
    try { authR = await fetch(baseUrl + '/auth/ksef-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(ksefTokenBody),
    }); } catch (e) { return jsonRes({ error: 'Błąd sieci /auth/ksef-token: ' + e.message }, 502); }
    if (!authR.ok) return jsonRes({ error: 'KSeF /auth/ksef-token HTTP ' + authR.status, detail: await authR.text() }, 502);
    const authData = await authR.json();
    const authToken2 = authData.authenticationToken && authData.authenticationToken.token
      || authData.authenticationToken;
    const referenceNumber2 = authData.referenceNumber;
    if (!authToken2) return jsonRes({ error: 'Brak authenticationToken w /auth/ksef-token', detail: authData }, 502);

    // 7. Polling statusu
    const poll2 = await pollAuthStatus(baseUrl, referenceNumber2, authToken2, 10);
    if (!poll2.ok) return jsonRes({ error: poll2.error }, 502);

    // 8. Redeem → accessToken
    let redeemR;
    try { redeemR = await fetch(baseUrl + '/auth/token/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: 'Bearer ' + authToken2 },
      body: JSON.stringify({ referenceNumber: referenceNumber2 }),
    }); } catch (e) { return jsonRes({ error: 'Błąd sieci /auth/token/redeem: ' + e.message }, 502); }
    if (!redeemR.ok) return jsonRes({ error: 'KSeF /auth/token/redeem HTTP ' + redeemR.status, detail: await redeemR.text() }, 502);
    const tokens2 = await redeemR.json();

    return jsonRes({
      accessToken: tokens2.accessToken,
      refreshToken: tokens2.refreshToken,
      expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
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

  // ── Krok 1: Pobierz Challenge ─────────────────────────────────────────────
  const chalR = await fetch(`${baseUrl}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ contextIdentifier: { type: 'onip', identifier: nip } }),
  });
  if (!chalR.ok) return jsonRes({ error: 'KSeF /auth/challenge failed HTTP ' + chalR.status, detail: await chalR.text() }, 502);
  const chalData = await chalR.json();
  const challenge = chalData.challenge;
  if (!challenge) return jsonRes({ error: 'Brak challenge w odpowiedzi KSeF', detail: chalData }, 502);

  // ── Krok 2: Generuj AuthTokenRequest XML ─────────────────────────────────
  // Format enveloping: AuthTokenRequest jest wewnątrz ds:Object
  // Digest liczymy od zawartości Object (AuthTokenRequest bez deklaracji XML)
  // To jest prostsze niż enveloped bo nie wymaga transformacji C14N

  const certB64clean = cred.cert_pem
    ? cred.cert_pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    : '';

  // Zawartość do podpisania — AuthTokenRequest BEZ deklaracji XML
  const authTokenContent = '<AuthTokenRequest' +
    ' xmlns="http://ksef.mf.gov.pl/auth/token/2.0">' +
    '<Challenge>' + challenge + '</Challenge>' +
    '<ContextIdentifier><Nip>' + nip + '</Nip></ContextIdentifier>' +
    '<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>' +
    '</AuthTokenRequest>';

  // Digest SHA-256 nad zawartością Object (po exc-c14n — dla prostego XML bez atrybutów = raw bytes)
  const objBytes = new TextEncoder().encode(authTokenContent);
  const digestBuf = await crypto.subtle.digest('SHA-256', objBytes);
  const digestB64 = btoa(String.fromCharCode(...new Uint8Array(digestBuf)));

  // Czas podpisania
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // Digest certyfikatu dla XAdES SigningCertificate
  const certDer = Uint8Array.from(atob(certB64clean), c => c.charCodeAt(0));
  const certDigestBuf = await crypto.subtle.digest('SHA-256', certDer);
  const certDigestB64 = btoa(String.fromCharCode(...new Uint8Array(certDigestBuf)));

  // SignedInfo — to co faktycznie podpisujemy
  const isEC = keyType === 'EC';
  const sigAlgUri = isEC
    ? 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256'
    : 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

  const signedInfoXml = '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
    ' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">' +
    '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>' +
    '<ds:SignatureMethod Algorithm="' + sigAlgUri + '"/>' +
    '<ds:Reference Id="Ref-1" URI="#AuthObj">' +
    '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>' +
    '<ds:DigestValue>' + digestB64 + '</ds:DigestValue>' +
    '</ds:Reference>' +
    '</ds:SignedInfo>';

  // Podpisz SignedInfo (po exc-c14n — dla naszego prostego XML bez atrybutów na elementach = raw)
  const signedInfoBytes = new TextEncoder().encode(signedInfoXml);
  const sigBuf = await crypto.subtle.sign(
    isEC ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5',
    privateKey, signedInfoBytes
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // Pełny dokument XAdES enveloping
  const xadesXml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ds:Signature Id="Sig-1"' +
    ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
    ' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">' +
    signedInfoXml.replace(' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
      ' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"', '') +
    '<ds:SignatureValue>' + sigB64 + '</ds:SignatureValue>' +
    '<ds:KeyInfo>' +
    '<ds:X509Data><ds:X509Certificate>' + certB64clean + '</ds:X509Certificate></ds:X509Data>' +
    '</ds:KeyInfo>' +
    '<ds:Object Id="AuthObj">' + authTokenContent + '</ds:Object>' +
    '</ds:Signature>';

  // ── Krok 4: Wyślij ────────────────────────────────────────────────────────
  const authR = await fetch(baseUrl + '/auth/xades-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', 'Accept': 'application/json' },
    body: xadesXml,
  });
  if (!authR.ok) {
    const errText = await authR.text();
    console.log('KSeF xades error:', errText.slice(0, 800));
    return jsonRes({ error: 'KSeF /auth/xades-signature failed HTTP ' + authR.status, detail: errText }, 502);
  }
  const authData = await authR.json();
  const { authenticationToken, referenceNumber } = authData;
  if (!authenticationToken) return jsonRes({ error: 'Brak authenticationToken', detail: authData }, 502);

  // ── Krok 5: Polling statusu ────────────────────────────────────────────────
  const poll = await pollAuthStatus(baseUrl, referenceNumber, authenticationToken, 8);
  if (!poll.ok) return jsonRes({ error: poll.error }, 502);

  // ── Krok 6: Redeem → accessToken + refreshToken ────────────────────────────
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
