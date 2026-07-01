import rs from "https://esm.sh/jsrsasign@11.1.0?bundle";

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}
function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...cors() },
  });
}

async function verifyUser(req: Request) {
  const SVC = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SVC) return { ok: false, status: 500, message: "SERVICE_ROLE_KEY not set" };
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!auth) return { ok: false, status: 401, message: "missing jwt" };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SVC, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: "invalid jwt" };
  const u = await r.json();
  const tid = u?.app_metadata?.tenant_id;
  if (!tid) return { ok: false, status: 403, message: "no tenant_id" };
  return { ok: true, tenantId: tid, service: SVC };
}

function isoDate(d: string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
function vatCode(rate: number): string {
  if (rate === 23) return "A"; if (rate === 8) return "B"; if (rate === 5) return "C";
  if (rate === 0) return "D"; if (rate === -1) return "E"; return "A";
}
function round2(n: number): number { return Math.round((+(n || 0)) * 100) / 100; }
function fmt2(n: number): string { return round2(n).toFixed(2); }
function escXml(s: unknown): string {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
async function sha256b64(data: Uint8Array): Promise<string> {
  return bufToB64(await crypto.subtle.digest("SHA-256", data));
}

// deno-lint-ignore no-explicit-any
function buildFA3(inv: Record<string,any>, items: Record<string,any>[], settings: Record<string,any>): string {
  const s = inv.seller_snapshot || {};
  const sellerNip = (s.nip || settings.seller_nip || "").replace(/[\s-]/g, "");
  const buyerNip  = (inv.buyer_nip || "").replace(/[\s-]/g, "");
  const vatGroups: Record<string,{net:number;vat:number}> = {};
  for (const it of (items||[])) {
    const k = String(it.vat_rate);
    if (!vatGroups[k]) vatGroups[k] = { net:0, vat:0 };
    vatGroups[k].net += round2(it.line_net);
    vatGroups[k].vat += round2(it.line_vat);
  }
  const totalNet   = fmt2(items.reduce((a,i) => a+round2(i.line_net),   0));
  const totalVat   = fmt2(items.reduce((a,i) => a+round2(i.line_vat),   0));
  const totalGross = fmt2(items.reduce((a,i) => a+round2(i.line_gross), 0));
  const pozycje = items.map((it,idx) => {
    const vc = vatCode(it.vat_rate);
    return `
    <FaWiersz>
      <NrWierszaFa>${idx+1}</NrWierszaFa>
      <P_7>${escXml(it.name||"")}</P_7>
      <P_8A>${escXml(it.unit||"szt")}</P_8A>
      <P_8B>${fmt2(it.quantity)}</P_8B>
      <P_9A>${fmt2(it.unit_net)}</P_9A>
      <P_11>${fmt2(it.line_net)}</P_11>
      <P_12>${it.vat_rate===-1?"zw":fmt2(it.vat_rate)}</P_12>
      <P_12_XII>${vc}</P_12_XII>
      <P_13>${fmt2(it.line_vat)}</P_13>
      ${it.pkwiu?`<PKWiU>${escXml(it.pkwiu)}</PKWiU>`:""}
    </FaWiersz>`;
  }).join("");
  const stawki = Object.keys(vatGroups).map(k => {
    const g = vatGroups[k]; const vc = vatCode(+k);
    return `
    <P_13_${vc}>${fmt2(g.net)}</P_13_${vc}>
    <P_14_${vc}>${fmt2(g.vat)}</P_14_${vc}>`;
  }).join("");
  const payMap: Record<string,string> = {"przelew":"6","gotówka":"1","karta":"5","BLIK":"5"};
  const payCode = payMap[inv.payment_method||""]||"6";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/" xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>PorterDesign</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne><NIP>${escXml(sellerNip)}</NIP><Nazwa>${escXml(s.name||settings.seller_name||"")}</Nazwa></DaneIdentyfikacyjne>
    <Adres><KodKraju>PL</KodKraju><AdresL1>${escXml((s.address||settings.seller_address||"")+" "+(s.postal||settings.seller_postal||""))}</AdresL1><AdresL2>${escXml(s.city||settings.seller_city||"")}</AdresL2></Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>${buyerNip?`<NIP>${escXml(buyerNip)}</NIP>`:""}<Nazwa>${escXml(inv.buyer_name||"")}</Nazwa></DaneIdentyfikacyjne>
    <Adres><KodKraju>PL</KodKraju><AdresL1>${escXml((inv.buyer_address||"")+" "+(inv.buyer_postal||""))}</AdresL1><AdresL2>${escXml(inv.buyer_city||"")}</AdresL2></Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${isoDate(inv.issue_date)}</P_1><P_1M>${isoDate(inv.sale_date||inv.issue_date)}</P_1M>
    <P_2>${escXml(inv.number||"")}</P_2><P_15>${totalGross}</P_15>
    <Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><P_19>2</P_19><P_22>2</P_22><P_23>2</P_23><P_PMarzy>2</P_PMarzy></Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    ${inv.notes?`<DodatkowyOpis><P_Opis>${escXml(inv.notes)}</P_Opis></DodatkowyOpis>`:""}
    ${pozycje}
    <Rozliczenie>${stawki}
    <P_13_Razem>${totalNet}</P_13_Razem>
    <P_14_Razem>${totalVat}</P_14_Razem></Rozliczenie>
    <Platnosc>
      <Zaplacono>2</Zaplacono><DataZaplaty>${isoDate(inv.due_date)}</DataZaplaty><FormaPlatnosci>${payCode}</FormaPlatnosci>
      ${(s.bank||settings.seller_bank)?`<NrRachunku>${escXml((s.bank||settings.seller_bank||"").replace(/\s/g,""))}</NrRachunku>`:""}
    </Platnosc>
  </Fa>
</Faktura>`;
}

// Importuje klucz publiczny RSA z certyfikatu X.509 (DER lub PEM).
// Deno wspiera "x509" jako format importu od v1.33 — używamy tego zamiast ręcznego ASN.1.
async function fetchKsefPublicKey(baseUrl: string, accessToken: string): Promise<CryptoKey> {
  const r = await fetch(`${baseUrl}/security/public-key-certificates`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`GET /security/public-key-certificates HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
  const data = await r.json();
  // Odpowiedź: array PublicKeyCertificate { certificate, usage: ["SymmetricKeyEncryption"|"KsefTokenEncryption"] }
  const certs: Array<Record<string,unknown>> = Array.isArray(data) ? data : (data.certificates || data.items || [data]);
  const cert = certs.find(c => {
    const usage = c.usage;
    if (Array.isArray(usage)) return usage.some((u: string) => String(u).includes("SymmetricKeyEncryption"));
    return String(usage||"").includes("SymmetricKeyEncryption");
  });
  if (!cert) {
    const debug = certs.map(c => ({ usage: c.usage, hasCert: !!(c.certificate) }));
    throw new Error(`Brak cert SymmetricKeyEncryption. Dostępne: ${JSON.stringify(debug).slice(0,300)}`);
  }
  // DEBUG: zapisz strukturę cert do środowiska żeby zobaczyć
  console.log("KSeF cert keys:", Object.keys(cert));
  console.log("KSeF cert usage:", cert.usage);
  console.log("KSeF cert.certificate first 100 chars:", String(cert.certificate||"").slice(0,100));
  // certificate z KSeF to base64 DER (X.509) - trzeba wyciągnąć SPKI
  // Ale WebCrypto akceptuje X.509 przez "x509" format (Deno >= 1.33)
  const certB64 = String(cert.certificate || "");
  const derBuf = Uint8Array.from(atob(certB64), c => c.charCodeAt(0)).buffer;
  // Deno obsługuje "x509" jako format do importu certyfikatu X.509
  return await crypto.subtle.importKey(
    "spki" as "spki",
    derBuf,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, ["encrypt"]
  ).catch(async () => {
    // Fallback: może to jednak X.509 - wyciągnij SPKI z X.509 przez jsrsasign
    const certPem = "-----BEGIN CERTIFICATE-----\n" +
      certB64.match(/.{1,64}/g)!.join("\n") +
      "\n-----END CERTIFICATE-----";
    const x509 = new rs.X509();
    x509.readCertPEM(certPem);
    const pubKeyObj = x509.getPublicKey();
    const jwk = rs.KEYUTIL.getJWKFromKey(pubKeyObj);
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true },
      { name: "RSA-OAEP", hash: "SHA-256" },
      false, ["encrypt"]
    );
  });
}

// RSA-OAEP-SHA256 - Web Crypto z kluczem publicznym wyciągniętym przez jsrsasign
async function rsaOaepEncrypt(data: Uint8Array, certPem: string): Promise<Uint8Array> {
  const x509 = new rs.X509();
  x509.readCertPEM(certPem);
  const pubKeyObj = x509.getPublicKey();
  const jwk = rs.KEYUTIL.getJWKFromKey(pubKeyObj);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true },
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, data);
  return new Uint8Array(encrypted);
}

async function encryptInvoice(xmlBytes: Uint8Array, aesKey: CryptoKey, iv: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, xmlBytes));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string,string>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { invoiceId, accessToken, baseUrl } = body;
  if (!invoiceId || !accessToken || !baseUrl)
    return jsonRes({ error: "invoiceId, accessToken i baseUrl wymagane" }, 400);

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const [invR, settR] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}&tenant_id=eq.${auth.tenantId}&select=*,invoice_items(*)`, { headers: sbH }),
    fetch(`${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=*`, { headers: sbH }),
  ]);
  if (!invR.ok) return jsonRes({ error: "Błąd pobierania faktury" }, 500);
  const inv = (await invR.json())?.[0];
  if (!inv) return jsonRes({ error: "Faktura nie znaleziona" }, 404);
  if (inv.status !== "issued") return jsonRes({ error: "Tylko wystawione faktury można wysłać do KSeF" }, 400);
  if (inv.ksef_status === "confirmed") return jsonRes({ error: `Już w KSeF (nr: ${inv.ksef_number})` }, 400);

  const settings = settR.ok ? ((await settR.json())||[])[0]||{} : {};
  const items = inv.invoice_items || [];
  const xml = buildFA3(inv, items, settings);
  const xmlBytes = new TextEncoder().encode(xml);

  try {
    // 1. Certyfikat KSeF (PEM)
    const certPem = await fetchKsefCertPem(baseUrl, accessToken);

    // 2. Klucz AES-256 + IV (raw bytes, jak w SDK)
    const aesKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await crypto.subtle.importKey("raw", aesKeyRaw, { name: "AES-CBC" }, false, ["encrypt"]);

    // 3. Zaszyfruj klucz AES przez RSA-OAEP-SHA256 (jsrsasign — zgodność z Node.js crypto)
    const encryptedKeyBytes = await rsaOaepEncrypt(aesKeyRaw, certPem);
    const encryptedSymmetricKey = bufToB64(encryptedKeyBytes.buffer);
    const initializationVector = bufToB64(iv.buffer);

    // 4. Otwórz sesję online
    const sessionR = await fetch(`${baseUrl}/sessions/online`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
        encryption: { encryptedSymmetricKey, initializationVector },
      }),
    });
    if (!sessionR.ok) {
      const t = await sessionR.text();
      return jsonRes({ error: `KSeF /sessions/online HTTP ${sessionR.status}`, detail: t }, 502);
    }
    const sessionData = await sessionR.json();
    const sessionRef = sessionData.referenceNumber;
    if (!sessionRef) return jsonRes({ error: "Brak referenceNumber sesji", detail: sessionData }, 502);

    // 5. Zaszyfruj fakturę AES-CBC
    const encryptedXml    = await encryptInvoice(xmlBytes, aesKey, iv);
    const invoiceHashB64   = await sha256b64(xmlBytes);
    const encryptedHashB64 = await sha256b64(encryptedXml);
    const encryptedContent = bufToB64(encryptedXml.buffer);

    // 6. Wyślij fakturę
    const sendR = await fetch(`${baseUrl}/sessions/online/${encodeURIComponent(sessionRef)}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        invoiceHash: invoiceHashB64,
        invoiceSize: xmlBytes.length,
        encryptedInvoiceHash: encryptedHashB64,
        encryptedInvoiceSize: encryptedXml.length,
        encryptedInvoiceContent: encryptedContent,
      }),
    });
    const sendText = await sendR.text();
    if (!sendR.ok) {
      await fetch(`${baseUrl}/sessions/online/${encodeURIComponent(sessionRef)}/close`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({ ksef_status: "error", ksef_error: sendText.slice(0,500) }),
      });
      return jsonRes({ error: "KSeF odrzucił fakturę", detail: sendText }, 502);
    }
    let sendData: Record<string,string> = {};
    try { sendData = JSON.parse(sendText); } catch { /* ignore */ }
    const invoiceRefNumber = sendData.referenceNumber || "";

    // Zamknij sesję online — bez tego KSeF nie rozpoczyna przetwarzania faktur.
    // Sesja online w KSeF 2.0 to batch upload; close = "koniec batcha, przetwarzaj".
    await fetch(`${baseUrl}/sessions/online/${encodeURIComponent(sessionRef)}/close`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }).catch(() => {});

    await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: "PATCH", headers: sbH,
      body: JSON.stringify({
        ksef_status: "sent",
        ksef_number: sessionRef,
        ksef_mode: "online",
        ksef_sent_at: new Date().toISOString(),
        ksef_error: null,
        xml_payload: xml,
      }),
    });

    return jsonRes({ ok: true, ksefStatus: "sent", sessionRef, xmlLength: xml.length });

  } catch(e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: "PATCH", headers: sbH,
      body: JSON.stringify({ ksef_status: "error", ksef_error: msg.slice(0,500) }),
    }).catch(() => {});
    return jsonRes({ error: msg }, 502);
  }
});
