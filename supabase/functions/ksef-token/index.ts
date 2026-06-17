// supabase/functions/ksef-token/index.ts
// Zapis/odczyt/usuwanie credentials KSeF (certyfikat lub token).
// GET → status, POST → zapis (cert+key+pass LUB token), DELETE → usuń.
// jsrsasign deszyfruje ENCRYPTED PRIVATE KEY hasłem i normalizuje do PKCS#8.

import rs from "https://esm.sh/jsrsasign@11.1.0?bundle";

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}
function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

async function verifyUser(req: Request) {
  const SVC = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SVC) return { ok: false, status: 500, message: "SERVICE_ROLE_KEY not set" };
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!auth) return { ok: false, status: 401, message: "missing token" };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SVC, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: "invalid jwt" };
  const u = await r.json();
  const tid = u?.app_metadata?.tenant_id;
  if (!tid) return { ok: false, status: 403, message: "no tenant_id" };
  return { ok: true, tenantId: tid, service: SVC };
}

async function aesEncrypt(plain: string, hexKey: string): Promise<string> {
  const hexToBytes = (h: string) => {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return a;
  };
  const key = await crypto.subtle.importKey("raw", hexToBytes(hexKey), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  return b64(iv) + ":" + b64(new Uint8Array(enc));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  const ENC_KEY = Deno.env.get("KSEF_ENC_KEY");
  if (!ENC_KEY || ENC_KEY.length !== 64) return jsonRes({ error: "KSEF_ENC_KEY not configured (64-hex)" }, 500);

  const sbH = {
    apikey: auth.service!, Authorization: `Bearer ${auth.service}`,
    "Content-Type": "application/json", Prefer: "return=representation",
  };
  const credUrl = `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}`;

  // GET — status
  if (req.method === "GET") {
    const r = await fetch(credUrl + "&select=tenant_id,env,updated_at,cert_pem,token_encrypted", { headers: sbH });
    if (!r.ok) return jsonRes({ error: "db error" }, 500);
    const rows = await r.json();
    const row = rows?.[0];
    const hasCert = !!(row && (row.cert_pem || row.token_encrypted));
    return jsonRes({ hasCert, mode: row?.token_encrypted ? "token" : (row?.cert_pem ? "cert" : null), env: row?.env || "prod", updated_at: row?.updated_at || null });
  }

  // POST — zapis
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

    const env = body?.env === "test" ? "test" : "prod";
    const check = await fetch(credUrl + "&select=tenant_id", { headers: sbH });
    const exists = check.ok && (await check.json()).length > 0;
    const method = exists ? "PATCH" : "POST";
    const url = exists ? credUrl : `${SB_URL}/rest/v1/ksef_credentials`;

    // Tryb token
    const ksefToken = (body?.token || "").trim();
    if (ksefToken) {
      if (ksefToken.length < 20) return jsonRes({ error: "Token za krótki" }, 400);
      const payload = {
        tenant_id: auth.tenantId, env,
        token_encrypted: await aesEncrypt(ksefToken, ENC_KEY),
        cert_pem: null, key_encrypted: null, cert_pass_enc: null, key_type: null,
        updated_at: new Date().toISOString(),
      };
      const r = await fetch(url, { method, headers: sbH, body: JSON.stringify(payload) });
      if (!r.ok) return jsonRes({ error: "Błąd zapisu tokenu", detail: await r.text() }, 500);
      return jsonRes({ ok: true, env, mode: "token" });
    }

    // Tryb certyfikat
    const certPem = (body?.certPem || "").trim();
    const keyPem = (body?.keyPem || "").trim();
    const keyPass = body?.keyPass || "";
    if (!certPem.includes("BEGIN CERTIFICATE")) return jsonRes({ error: "Nieprawidłowy .crt" }, 400);
    if (!keyPem.includes("PRIVATE KEY")) return jsonRes({ error: "Nieprawidłowy .key" }, 400);

    // Deszyfruj/normalizuj klucz przez jsrsasign → zawsze czysty PKCS#8 PEM
    let cleanKeyPem: string, keyType: string;
    try {
      const keyObj = keyPem.includes("ENCRYPTED")
        ? rs.KEYUTIL.getKey(keyPem, keyPass)   // ENCRYPTED PRIVATE KEY + hasło
        : rs.KEYUTIL.getKey(keyPem);
      // Wyeksportuj jako czysty PKCS#8
      cleanKeyPem = rs.KEYUTIL.getPEM(keyObj, "PKCS8PRV");
      // Typ klucza: EC ma .curveName/.ecparams/.type==="EC", RSA ma .n
      keyType = (keyObj.curveName || keyObj.ecparams || keyObj.type === "EC") ? "EC" : "RSA";
    } catch (e) {
      return jsonRes({ error: "Błąd odczytu klucza (sprawdź hasło): " + (e instanceof Error ? e.message : String(e)) }, 400);
    }

    const payload = {
      tenant_id: auth.tenantId, env,
      cert_pem: certPem,
      key_encrypted: await aesEncrypt(cleanKeyPem, ENC_KEY),
      key_type: keyType,
      cert_pass_enc: null, token_encrypted: null,
      updated_at: new Date().toISOString(),
    };
    const r = await fetch(url, { method, headers: sbH, body: JSON.stringify(payload) });
    if (!r.ok) return jsonRes({ error: "Błąd zapisu certyfikatu", detail: await r.text() }, 500);
    return jsonRes({ ok: true, env, mode: "cert", keyType });
  }

  // DELETE
  if (req.method === "DELETE") {
    await fetch(credUrl, { method: "DELETE", headers: sbH });
    return jsonRes({ ok: true });
  }

  return jsonRes({ error: "method not allowed" }, 405);
});
