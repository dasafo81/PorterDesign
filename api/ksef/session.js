// api/ksef/session.js  (v5 — Edge runtime, ENCRYPTED PRIVATE KEY przez Web Crypto)
// Obsługuje ENCRYPTED PRIVATE KEY (PBES2/AES-256-CBC/PBKDF2-SHA256) bez Node.js crypto.
// Edge runtime = Cloudflare-like, ma pełny dostęp do sieci (w tym ksef-test.podatki.gov.pl).

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
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` },
  });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

// AES-256-GCM decrypt (nasze szyfrowanie tokenu/klucza)
async function aesGcmDecrypt(combined, hexKey) {
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

// PEM → DER bytes
function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── ASN.1 DER parser (minimalny, dla PBES2) ──────────────────────────────────
// Czyta tag, długość i zawartość elementu DER. Zwraca {tag, content, next}.
function derRead(buf, offset) {
  offset = offset || 0;
  const tag = buf[offset++];
  let len = buf[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) len = (len << 8) | buf[offset++];
  }
  return { tag, content: buf.slice(offset, offset + len), next: offset + len };
}

// Parsuje pierwsze N elementów SEQUENCE na tym samym poziomie
function derSeqChildren(buf) {
  const children = [];
  let off = 0;
  while (off < buf.length) {
    const el = derRead(buf, off);
    children.push(el);
    off = el.next;
  }
  return children;
}

// Deszyfruje ENCRYPTED PRIVATE KEY hasłem (PBES2/PBKDF2/AES-256-CBC)
// Struktura DER: SEQUENCE { SEQUENCE { OID pbes2, SEQUENCE { SEQUENCE { OID pbkdf2,
//   SEQUENCE { OCTET STRING salt, INTEGER iter, [INTEGER keyLen,] SEQUENCE { OID hmac } } },
//   SEQUENCE { OID aes256cbc, OCTET STRING iv } } }, OCTET STRING ciphertext }
async function decryptEncryptedPrivateKey(encPem, passphrase) {
  const der = pemToDer(encPem);

  // Outer SEQUENCE
  const outer = derRead(der, 0);
  const outerChildren = derSeqChildren(outer.content);
  // outerChildren[0] = AlgorithmIdentifier SEQUENCE, outerChildren[1] = OCTET STRING ciphertext
  const algSeq = derSeqChildren(outerChildren[0].content);
  // algSeq[0] = OID pbes2 (ignorujemy), algSeq[1] = SEQUENCE parametry
  const pbes2Params = derSeqChildren(algSeq[1].content);
  // pbes2Params[0] = SEQUENCE kdf, pbes2Params[1] = SEQUENCE enc
  const kdfSeq = derSeqChildren(pbes2Params[0].content);
  // kdfSeq[0] = OID pbkdf2, kdfSeq[1] = SEQUENCE pbkdf2Params
  const pbkdf2Params = derSeqChildren(kdfSeq[1].content);
  // pbkdf2Params[0] = OCTET STRING salt, pbkdf2Params[1] = INTEGER iterations
  // pbkdf2Params[2] = opcjonalnie INTEGER keyLen lub SEQUENCE hmac
  const salt = pbkdf2Params[0].content;
  // INTEGER: może mieć leading 0x00
  let iterBytes = pbkdf2Params[1].content;
  let iterations = 0;
  for (const b of iterBytes) iterations = (iterations << 8) | b;

  // Algorytm szyfrowania: pbes2Params[1]
  const encSeq = derSeqChildren(pbes2Params[1].content);
  // encSeq[0] = OID (AES-256-CBC lub inne), encSeq[1] = OCTET STRING IV
  const iv = encSeq[1].content;

  // Ciphertext: outerChildren[1].content
  const ciphertext = outerChildren[1].content;

  // PBKDF2 → klucz AES
  const passBytes = new TextEncoder().encode(passphrase || '');
  const baseKey = await crypto.subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );

  // Diagnostyka
  const diagMsg = `PBES2 diag: der_len=${der.length} outer_content_len=${outer.content.length} outer_children=${outerChildren.length} ct_tag=0x${outerChildren[1]?outerChildren[1].tag.toString(16):'?'} ct_len=${ciphertext.length} alg_len=${outerChildren[0].content.length} salt=${Array.from(salt).map(b=>b.toString(16).padStart(2,'0')).join('')} iter=${iterations} iv=${Array.from(iv).map(b=>b.toString(16).padStart(2,'0')).join('')} pass_len=${(passphrase||'').length}`;
  console.log(diagMsg);
  // AES-CBC decrypt
  const plainDer = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext);
  return new Uint8Array(plainDer);  // PKCS#8 DER (odszyfrowany klucz prywatny)
}

// Buduje PKCS#8 DER z PKCS#1 DER (dla kluczy bez hasła w formacie RSA PRIVATE KEY)
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
function pkcs1ToPkcs8(pkcs1Der) {
  const oid = new Uint8Array([0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01]);
  const version   = new Uint8Array([0x02,0x01,0x00]);
  const algId     = derTLV(0x30, concat(derTLV(0x06, oid), new Uint8Array([0x05,0x00])));
  const privKey   = derTLV(0x04, pkcs1Der);
  return derTLV(0x30, concat(version, algId, privKey));
}

// Import klucza prywatnego RSA do Web Crypto (obsługuje PKCS#8 plain i ENCRYPTED)
async function importPrivateKey(keyPem, passphrase) {
  let pkcs8Der;

  if (keyPem.includes('ENCRYPTED PRIVATE KEY')) {
    // Deszyfruj hasłem → czysty PKCS#8 DER
    pkcs8Der = await decryptEncryptedPrivateKey(keyPem, passphrase);
  } else if (keyPem.includes('BEGIN RSA PRIVATE KEY')) {
    // PKCS#1 → opakuj w PKCS#8
    pkcs8Der = pkcs1ToPkcs8(pemToDer(keyPem));
  } else {
    // Już jest PKCS#8 plain
    pkcs8Der = pemToDer(keyPem);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// Podpisz dane kluczem → base64
async function signData(data, privateKey) {
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(data)
  );
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

  // Pobierz certyfikat z DB
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

  // Odszyfruj klucz PEM (nasze AES-GCM)
  let keyPem;
  try { keyPem = await aesGcmDecrypt(cred.key_encrypted, ENC_KEY); }
  catch (e) { return jsonRes({ error: 'Błąd odszyfrowania klucza: ' + e.message }, 500); }

  // Hasło do ENCRYPTED PRIVATE KEY
  let keyPass = '';
  if (cred.cert_pass_enc) {
    try { keyPass = await aesGcmDecrypt(cred.cert_pass_enc, ENC_KEY); } catch (e) { keyPass = ''; }
  }

  // Import klucza prywatnego
  let privateKey;
  try { privateKey = await importPrivateKey(keyPem, keyPass); }
  catch (e) { return jsonRes({ error: 'Błąd importu klucza RSA: ' + e.message + '. Sprawdź hasło do certyfikatu.' }, 500); }

  // NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH }
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts && setts[0] && setts[0].seller_nip) || '').replace(/[\s\-]/g, '');
  if (!nip || nip.length !== 10) {
    return jsonRes({ error: 'Brak NIP w ustawieniach faktury.' }, 400);
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
  if (!chal.challenge) return jsonRes({ error: 'Brak challenge w odpowiedzi KSeF', detail: chal }, 502);

  // Krok 2: Podpis RSA-SHA256
  let signature;
  try { signature = await signData(chal.challenge + chal.timestamp, privateKey); }
  catch (e) { return jsonRes({ error: 'Błąd podpisywania: ' + e.message }, 500); }

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
    return jsonRes({ error: 'KSeF InitialisationSigned failed', detail: await initR.text() }, 502);
  }
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
