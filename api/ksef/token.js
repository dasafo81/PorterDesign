// api/ksef/token.js  (v3)
// Przy zapisie certyfikatu: jeśli klucz jest ENCRYPTED PRIVATE KEY,
// odszyfrowuje go hasłem (PBKDF2/AES-CBC) i zapisuje czysty PKCS#8
// zaszyfrowany naszym AES-256-GCM. Session.js nie musi już robić PBKDF2.

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

// AES-256-GCM encrypt
async function aesEncrypt(plain, hexKey) {
  function hexToBytes(h) {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i*2, i*2+2), 16);
    return a;
  }
  const key = await crypto.subtle.importKey('raw', hexToBytes(hexKey), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const b64 = b => btoa(String.fromCharCode(...b));
  return b64(iv) + ':' + b64(new Uint8Array(enc));
}

// AES-256-GCM encrypt bytes (dla binarnego PKCS#8)
async function aesEncryptBytes(bytes, hexKey) {
  function hexToBytes(h) {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i*2, i*2+2), 16);
    return a;
  }
  const key = await crypto.subtle.importKey('raw', hexToBytes(hexKey), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  const b64 = b => btoa(String.fromCharCode(...b));
  return b64(iv) + ':' + b64(new Uint8Array(enc));
}

// PEM → DER
function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ASN.1 DER parser
function readTLV(buf, off) {
  off = off || 0;
  const tag = buf[off++];
  let len = buf[off++];
  if (len & 0x80) {
    const nb = len & 0x7f; len = 0;
    for (let i = 0; i < nb; i++) len = (len << 8) | buf[off++];
  }
  return { tag, content: buf.slice(off, off + len), next: off + len };
}
function seqChildren(buf) {
  const ch = []; let off = 0;
  while (off < buf.length) {
    const el = readTLV(buf, off); ch.push(el); off = el.next;
  }
  return ch;
}

// Deszyfruj ENCRYPTED PRIVATE KEY hasłem → czysty PKCS#8 DER (Uint8Array)
async function decryptEncryptedKey(encPem, passphrase) {
  const der = pemToDer(encPem);
  const outer = readTLV(der, 0);
  const outerCh = seqChildren(outer.content);
  const ciphertext = outerCh[1].content;
  const algIdCh = seqChildren(outerCh[0].content);
  const pbes2ParamsCh = seqChildren(algIdCh[1].content);
  const kdfCh = seqChildren(pbes2ParamsCh[0].content);
  const pbkdf2ParamsCh = seqChildren(kdfCh[1].content);
  const salt = pbkdf2ParamsCh[0].content;
  let iterations = 0;
  for (const b of pbkdf2ParamsCh[1].content) iterations = (iterations << 8) | b;
  const encCh = seqChildren(pbes2ParamsCh[1].content);
  const iv = encCh[1].content;

  const passBytes = new TextEncoder().encode(passphrase || '');
  const baseKey = await crypto.subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext);
  const plainBytes = new Uint8Array(plain);

  if (plainBytes[0] !== 0x30) {
    throw new Error('Złe hasło — odszyfrowany klucz nie jest poprawnym DER (bajt[0]=0x' + plainBytes[0].toString(16) + ')');
  }
  // Wykryj typ klucza z OID w PKCS#8
  // RSA OID: 2a 86 48 86 f7 0d 01 01 01
  // EC  OID: 2a 86 48 ce 3d 02 01
  // EC OID (id-ecPublicKey = 2a 86 48 ce 3d 02 01) zaczyna sie na bajcie [10]
  // Struktura: 30(SEQ) 81 87(len) 02 01 00(INT ver=0) 30 13(SEQ algId) 06 07(OID len=7) 2a 86 48 ce 3d...
  const isEC = plainBytes.length > 14 &&
    plainBytes[10] === 0x2a && plainBytes[11] === 0x86 && plainBytes[12] === 0x48 &&
    plainBytes[13] === 0xce && plainBytes[14] === 0x3d;
  return { der: plainBytes, keyType: isEC ? 'EC' : 'RSA' };
}

// Konwertuj PKCS#8 DER → PEM string
function derToPem(der, label) {
  const b64 = btoa(String.fromCharCode(...der));
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const ENC_KEY = process.env.KSEF_ENC_KEY;
  if (!ENC_KEY || ENC_KEY.length !== 64) {
    return json({ error: 'KSEF_ENC_KEY not configured (must be 64-char hex).' }, 500);
  }

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const credUrl = `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}`;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(credUrl + '&select=tenant_id,env,updated_at,cert_pem', { headers: sbH });
    if (!r.ok) return json({ error: 'db error' }, 500);
    const rows = await r.json();
    const row = rows && rows[0];
    return json({ hasCert: !!(row && row.cert_pem), env: row ? row.env : 'test', updated_at: row ? row.updated_at : null });
  }

  // ── POST: zapisz certyfikat ───────────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }

    const certPem = (body && body.certPem || '').trim();
    const keyPem  = (body && body.keyPem  || '').trim();
    const keyPass = (body && body.keyPass || '');
    const env     = (body && body.env) === 'prod' ? 'prod' : 'test';

    if (!certPem) return json({ error: 'certPem wymagany' }, 400);
    if (!keyPem)  return json({ error: 'keyPem wymagany' }, 400);
    if (!certPem.includes('-----BEGIN CERTIFICATE-----')) {
      return json({ error: 'Nieprawidłowy format .crt — oczekiwano PEM' }, 400);
    }
    if (!keyPem.includes('PRIVATE KEY')) {
      return json({ error: 'Nieprawidłowy format .key — oczekiwano PEM' }, 400);
    }

    // Jeśli klucz jest zaszyfrowany hasłem — odszyfruj teraz i zapisz czysty PKCS#8
    let keyToStore;
    let keyType = 'RSA'; // domyślnie RSA, nadpisywane poniżej
    if (keyPem.includes('ENCRYPTED PRIVATE KEY')) {
      if (!keyPass) return json({ error: 'Klucz jest zaszyfrowany — wymagane hasło' }, 400);
      let pkcs8Der;
      try {
        const result = await decryptEncryptedKey(keyPem, keyPass);
        pkcs8Der = result.der;
        keyType = result.keyType;
      } catch (e) {
        return json({ error: 'Błąd deszyfrowania klucza: ' + e.message }, 400);
      }
      // Konwertuj do PEM i zaszyfruj naszym AES-GCM
      keyToStore = await aesEncrypt(derToPem(pkcs8Der, 'PRIVATE KEY'), ENC_KEY);
    } else {
      // Już czysty PKCS#8 lub PKCS#1 — zaszyfruj bezpośrednio
      keyToStore = await aesEncrypt(keyPem, ENC_KEY);
      // Wykryj typ z nagłówka PEM
      keyType = keyPem.includes('BEGIN EC') ? 'EC' : 'RSA';
    }

    // Sprawdź czy rekord istnieje
    const check = await fetch(credUrl + '&select=tenant_id', { headers: sbH });
    const exists = check.ok && (await check.json()).length > 0;

    const payload = {
      tenant_id:       auth.tenantId,
      env,
      cert_pem:        certPem,
      key_encrypted:   keyToStore,  // czysty PKCS#8 zaszyfrowany AES-GCM
      cert_pass_enc:   null,         // hasło nie jest już potrzebne
      key_type:        keyType,   // 'RSA' lub 'EC'
      token_encrypted: null,
      updated_at:      new Date().toISOString(),
    };

    const method = exists ? 'PATCH' : 'POST';
    const url    = exists ? credUrl : `${SB_URL}/rest/v1/ksef_credentials`;
    const r2 = await fetch(url, { method, headers: sbH, body: JSON.stringify(payload) });
    if (!r2.ok) return json({ error: 'Błąd zapisu w DB', detail: await r2.text() }, 500);
    return json({ ok: true, env });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await fetch(credUrl, { method: 'DELETE', headers: sbH });
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
}
