// supabase/functions/ksef-session/index.ts
// KSeF 2.0 uwierzytelnianie — Supabase Edge Function (Deno).
// Używa jsrsasign do X.509, RSA-OAEP, podpisu — bez ręcznego parsowania ASN.1.
//
// Deploy: supabase functions deploy ksef-session --no-verify-jwt
// Sekrety: supabase secrets set KSEF_ENC_KEY=... SUPABASE_SERVICE_ROLE_KEY=...

import rs from "https://esm.sh/jsrsasign@11.1.0?bundle";

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";
const KSEF_URLS: Record<string, string> = {
  test: "https://api-test.ksef.mf.gov.pl/v2",
  prod: "https://api.ksef.mf.gov.pl/v2",
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

async function verifyUser(req: Request) {
  const SVC = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SVC) return { ok: false, status: 500, message: "SERVICE_ROLE_KEY not set" };
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!auth) return { ok: false, status: 401, message: "missing jwt" };
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SVC, Authorization: `Bearer ${auth}` },
  });
  if (!r.ok) return { ok: false, status: 401, message: "invalid jwt" };
  const u = await r.json();
  const tid = u?.app_metadata?.tenant_id;
  if (!tid) return { ok: false, status: 403, message: "no tenant_id" };
  return { ok: true, tenantId: tid, service: SVC };
}

// AES-256-GCM decrypt (format iv_b64:ct_b64)
async function aesDecrypt(combined: string, hexKey: string): Promise<string> {
  const hexToBytes = (h: string) => {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return a;
  };
  const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  const [ivB64, ctB64] = combined.split(":");
  const key = await crypto.subtle.importKey("raw", hexToBytes(hexKey), { name: "AES-GCM" }, false, ["decrypt"]);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivB64) }, key, b64ToBytes(ctB64));
  return new TextDecoder().decode(dec);
}

async function pollAuthStatus(baseUrl: string, ref: string, authToken: string, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(`${baseUrl}/auth/${ref}`, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!r.ok) continue;
    const d = await r.json();
    const code = d?.status?.code;
    if (code === 200) return { ok: true, data: d };
    if (code === 400 || code === 450) return { ok: false, error: "Uwierzytelnianie odrzucone: " + (d?.status?.description || code) };
  }
  return { ok: false, error: "Timeout oczekiwania na uwierzytelnienie KSeF" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  const ENC_KEY = Deno.env.get("KSEF_ENC_KEY");
  if (!ENC_KEY) return jsonRes({ error: "KSEF_ENC_KEY not configured" }, 500);

  const sbH = { apikey: auth.service!, Authorization: `Bearer ${auth.service}` };

  // Pobierz credentials
  const credR = await fetch(
    `${SB_URL}/rest/v1/ksef_credentials?tenant_id=eq.${auth.tenantId}&select=cert_pem,key_encrypted,env,key_type,token_encrypted`,
    { headers: sbH },
  );
  if (!credR.ok) return jsonRes({ error: "Błąd odczytu credentials" }, 500);
  const creds = await credR.json();
  const cred = creds?.[0];
  if (!cred) return jsonRes({ error: "Brak certyfikatu/tokenu KSeF. Wejdź w Ustawienia → KSeF." }, 400);

  // NIP
  const settR = await fetch(
    `${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=seller_nip`,
    { headers: sbH },
  );
  const setts = settR.ok ? await settR.json() : [];
  const nip = ((setts?.[0]?.seller_nip) || "").replace(/[\s\-]/g, "");
  if (!nip || nip.length !== 10) return jsonRes({ error: "Brak NIP w ustawieniach faktury." }, 400);

  const baseUrl = KSEF_URLS[cred.env] || KSEF_URLS.test;

  try {
    // ── ŚCIEŻKA TOKEN ──────────────────────────────────────────────────────
    if (cred.token_encrypted) {
      const ksefToken = await aesDecrypt(cred.token_encrypted, ENC_KEY);

      // 1. Pobierz certyfikat publiczny KSeF
      const pcR = await fetch(`${baseUrl}/security/public-key-certificates`);
      if (!pcR.ok) return jsonRes({ error: "KSeF public-key-certificates HTTP " + pcR.status }, 502);
      const pcData = await pcR.json();
      const certs = Array.isArray(pcData) ? pcData : (pcData.certificates || pcData.items || []);
      const encCert = certs.find((c: Record<string, unknown>) =>
        String(c.usage || "").includes("KsefTokenEncryption") || c.type === "KsefTokenEncryption"
      ) || certs[0];
      if (!encCert) return jsonRes({ error: "Brak certyfikatu szyfrującego w KSeF", detail: pcData }, 502);

      const certB64 = String(encCert.certificate || encCert.publicKey || encCert.value || "");
      const certPem = "-----BEGIN CERTIFICATE-----\n" +
        certB64.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").match(/.{1,64}/g)!.join("\n") +
        "\n-----END CERTIFICATE-----";

      // 2. Wyciągnij klucz publiczny RSA z X.509 (jsrsasign) → JWK → Web Crypto
      const x509 = new rs.X509();
      x509.readCertPEM(certPem);
      const pubKeyObj = x509.getPublicKey();
      // jsrsasign RSAKey → JWK (n, e), potem import do Web Crypto dla RSA-OAEP
      const jwk = rs.KEYUTIL.getJWKFromKey(pubKeyObj);
      const webPubKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true },
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );

      // 3. Challenge
      const chR = await fetch(`${baseUrl}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ contextIdentifier: { type: "onip", identifier: nip } }),
      });
      if (!chR.ok) return jsonRes({ error: "KSeF /auth/challenge HTTP " + chR.status, detail: await chR.text() }, 502);
      const chData = await chR.json();
      const challenge = chData.challenge;
      const timestampMs = chData.timestampMs || Date.now();
      if (!challenge) return jsonRes({ error: "Brak challenge", detail: chData }, 502);

      // 4. Szyfruj token: RSA-OAEP(SHA-256) nad "token|timestampMs" (Web Crypto)
      const plain = `${ksefToken}|${timestampMs}`;
      const encBuf = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        webPubKey,
        new TextEncoder().encode(plain),
      );
      const encryptedToken = btoa(String.fromCharCode(...new Uint8Array(encBuf)));

      // 5. POST /auth/ksef-token
      const atR = await fetch(`${baseUrl}/auth/ksef-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          challenge,
          contextIdentifier: { type: "onip", identifier: nip },
          encryptedToken,
        }),
      });
      if (!atR.ok) return jsonRes({ error: "KSeF /auth/ksef-token HTTP " + atR.status, detail: await atR.text() }, 502);
      const atData = await atR.json();
      const authToken = atData.authenticationToken?.token || atData.authenticationToken;
      const ref = atData.referenceNumber;
      if (!authToken) return jsonRes({ error: "Brak authenticationToken", detail: atData }, 502);

      // 6. Poll
      const poll = await pollAuthStatus(baseUrl, ref, authToken, 10);
      if (!poll.ok) return jsonRes({ error: poll.error }, 502);

      // 7. Redeem
      const rdR = await fetch(`${baseUrl}/auth/token/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ referenceNumber: ref }),
      });
      if (!rdR.ok) return jsonRes({ error: "KSeF /auth/token/redeem HTTP " + rdR.status, detail: await rdR.text() }, 502);
      const tokens = await rdR.json();

      return jsonRes({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
        env: cred.env,
        baseUrl,
      });
    }

    // ── ŚCIEŻKA CERTYFIKAT (XAdES) ─────────────────────────────────────────
    // TODO: XAdES wymaga biblioteki xadesjs (DOM natywny w Deno).
    // Najpierw weryfikujemy ścieżkę tokenu, XAdES dodamy w kolejnym kroku.
    if (cred.key_encrypted && !cred.token_encrypted) {
      return jsonRes({ error: "Uwierzytelnianie certyfikatem (XAdES) — w przygotowaniu. Użyj tokenu KSeF." }, 501);
    }

        return jsonRes({ error: "Brak tokenu ani certyfikatu w bazie." }, 400);
  } catch (e) {
    return jsonRes({ error: "Błąd: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
