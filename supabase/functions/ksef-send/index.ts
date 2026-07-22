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
  const sellerNip = (s.nip || settings.seller_nip || "").replace(/[\s-]/g, "").replace(/^PL/i, "");
  const buyerNip  = (inv.buyer_nip || "").replace(/[\s-]/g, "").replace(/^PL/i, "");
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
    return `
    <FaWiersz>
      <NrWierszaFa>${idx+1}</NrWierszaFa>
      <P_7>${escXml(it.name||"")}</P_7>
      ${it.pkwiu?`<PKWiU>${escXml(it.pkwiu)}</PKWiU>`:""}
      <P_8A>${escXml(it.unit||"szt")}</P_8A>
      <P_8B>${fmt2(it.quantity)}</P_8B>
      <P_9A>${fmt2(it.unit_net)}</P_9A>
      <P_11>${fmt2(it.line_net)}</P_11>
      <P_12>${it.vat_rate===-1?"zw":String(Math.round(+it.vat_rate))}</P_12>
    </FaWiersz>`;
  }).join("");
  const stawki = Object.keys(vatGroups).map(Number).sort((a,b)=>b-a).map(r => {
    const g = vatGroups[r];
    if (r === 23 || r === 22) return `
    <P_13_1>${fmt2(g.net)}</P_13_1><P_14_1>${fmt2(g.vat)}</P_14_1>`;
    if (r === 8 || r === 7) return `
    <P_13_2>${fmt2(g.net)}</P_13_2><P_14_2>${fmt2(g.vat)}</P_14_2>`;
    if (r === 5) return `
    <P_13_3>${fmt2(g.net)}</P_13_3><P_14_3>${fmt2(g.vat)}</P_14_3>`;
    if (r === 0) return `
    <P_13_6_1>${fmt2(g.net)}</P_13_6_1>`;
    if (r === -1) return `
    <P_13_7>${fmt2(g.net)}</P_13_7>`;
    return `
    <P_13_1>${fmt2(g.net)}</P_13_1><P_14_1>${fmt2(g.vat)}</P_14_1>`;
  }).join("");
  const payMap: Record<string,string> = {"przelew":"6","gotówka":"1","karta":"5","BLIK":"5"};
  const payCode = payMap[inv.payment_method||""]||"6";
  // ── Metoda kasowa ─────────────────────────────────────────────────────────
  // W FA(3) jedynym poprawnym miejscem na te adnotacje jest Adnotacje/P_16
  // (1 = tak, 2 = nie). Duplikowanie jej jako wolny tekst w <DodatkowyOpis>
  // dawalo sprzecznosc "P_16 = 2. Nie" + opis "Metoda Kasowa" — zgloszenie
  // ksiegowej (VIP Account, 2026-07-22). Flaga per faktura (invoices.kasowa)
  // ustawiana jest z invoice_settings.kasowa_default przy tworzeniu faktury.
  const p16 = (inv.kasowa === true || inv.kasowa === "true") ? "1" : "2";
  // Z Uwag wycinamy fraze "metoda kasowa" — recznie wpisana notatka nie moze
  // odtworzyc tej samej sprzecznosci w DodatkowyOpis.
  const opis = String(inv.notes || "").replace(/metoda\s+kasowa/gi, "").replace(/\s{2,}/g, " ").trim();
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
    <DaneIdentyfikacyjne>${buyerNip?`<NIP>${escXml(buyerNip)}</NIP>`:`<BrakID>1</BrakID>`}<Nazwa>${escXml(inv.buyer_name||"")}</Nazwa></DaneIdentyfikacyjne>
    <Adres><KodKraju>PL</KodKraju><AdresL1>${escXml((inv.buyer_address||"")+" "+(inv.buyer_postal||""))}</AdresL1><AdresL2>${escXml(inv.buyer_city||"")}</AdresL2></Adres>
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${isoDate(inv.issue_date)}</P_1>
    <P_2>${escXml(inv.number||"")}</P_2>
    <P_6>${isoDate(inv.sale_date||inv.issue_date)}</P_6>${stawki}
    <P_15>${totalGross}</P_15>
    <Adnotacje><P_16>${p16}</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19N>1</P_19N></Zwolnienie><NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    ${opis?`<DodatkowyOpis><Klucz>Uwagi</Klucz><Wartosc>${escXml(opis.slice(0,512))}</Wartosc></DodatkowyOpis>`:""}
    ${pozycje}
    <Platnosc>
      ${inv.due_date?`<TerminPlatnosci><Termin>${isoDate(inv.due_date)}</Termin></TerminPlatnosci>`:""}
      <FormaPlatnosci>${payCode}</FormaPlatnosci>
      ${(s.bank||settings.seller_bank)?`<RachunekBankowy><NrRB>${escXml((s.bank||settings.seller_bank||"").replace(/\s/g,""))}</NrRB></RachunekBankowy>`:""}
    </Platnosc>
  </Fa>
</Faktura>`;
}

// Importuje klucz publiczny RSA z certyfikatu X.509 (DER lub PEM).
// Deno wspiera "x509" jako format importu od v1.33 — używamy tego zamiast ręcznego ASN.1.
async function fetchKsefCertPem(baseUrl: string, accessToken: string): Promise<string> {
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
  // certificate z KSeF to base64 DER (X.509) — opakuj w PEM dla jsrsasign (rsaOaepEncrypt)
  const certB64 = String(cert.certificate || "");
  return "-----BEGIN CERTIFICATE-----\n" +
    certB64.match(/.{1,64}/g)!.join("\n") +
    "\n-----END CERTIFICATE-----";
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
  if (inv.doc_type === "eko") return jsonRes({ error: "Dokumenty EKO (gotówkowe) nie mogą być wysyłane do KSeF" }, 400);
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
    // Ten sam hash co invoiceHashB64, ale w Base64URL bez padding — do URLa QR (Kod I MF).
    // Zapisujemy juz przekonwertowany, zeby frontend nie musial nic o nim wiedziec:
    // czyta ksef_invoice_hash i wkleja bezposrednio do URLa weryfikacyjnego.
    const invoiceHashB64Url = invoiceHashB64
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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

    // Zapisz 'sent' od razu — sessionRef trafia do DB nawet jeśli polling poniżej się nie powiedzie
    await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: "PATCH", headers: sbH,
      body: JSON.stringify({
        ksef_status: "sent",
        ksef_number: sessionRef,
        ksef_mode: "online",
        ksef_sent_at: new Date().toISOString(),
        ksef_error: null,
        xml_payload: xml,
        ksef_invoice_hash: invoiceHashB64Url,
      }),
    });

    // Auto-polling: KSeF przetwarza sesję zwykle w 1-3 s — czekamy do ~12 s,
    // żeby użytkownik nie musiał ręcznie klikać "sprawdź status".
    // Kod 100/150 = przetwarzanie, 200 = sukces, inne = błąd.
    const authH = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    for (let i = 0; i < 8; i++) {
      await new Promise(res => setTimeout(res, 1500));
      const sessR2 = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}`, { headers: authH });
      if (!sessR2.ok) continue;
      const sessData2 = await sessR2.json();
      const code = sessData2.status?.code;
      if (code === 100 || code === 150) continue;

      if (code === 200) {
        const invR2 = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}/invoices`, { headers: authH });
        const invData2 = invR2.ok ? await invR2.json() : {};
        const first2 = (invData2.invoices || invData2.items || [])[0];
        const ksefNum2 = first2?.ksefNumber || first2?.ksefReferenceNumber;
        if (ksefNum2) {
          await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
            method: "PATCH", headers: sbH,
            body: JSON.stringify({ ksef_status: "confirmed", ksef_number: ksefNum2, ksef_upo: first2.upoDownloadUrl || null, ksef_error: null }),
          });
          return jsonRes({ ok: true, ksefStatus: "confirmed", ksefNumber: ksefNum2, sessionRef });
        }
        break; // 200 bez numeru — zostaw 'sent', dokończy ksef-status
      }

      // Sesja zakończona błędem — pobierz szczegóły odrzucenia z /invoices/failed
      let errMsg = (sessData2.status?.description || "błąd sesji")
        + (sessData2.status?.details ? ": " + sessData2.status.details.join("; ") : "");
      let failedRaw = null;
      try {
        const failedR = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionRef)}/invoices/failed`, { headers: authH });
        if (failedR.ok) {
          failedRaw = await failedR.json();
          const failed = (failedRaw.invoices || failedRaw.items || [])[0];
          if (failed) errMsg = (failed.status?.description || "")
            + (failed.status?.details ? " — " + failed.status.details.join("; ") : "");
        }
      } catch { /* ignore */ }
      await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
        method: "PATCH", headers: sbH,
        body: JSON.stringify({ ksef_status: "error", ksef_error: errMsg.slice(0,500) }),
      });
      return jsonRes({ error: "KSeF - błąd sesji/faktury", detail: errMsg, failedRaw, statusCode: code }, 502);
    }

    return jsonRes({ ok: true, ksefStatus: "sent", pending: true, sessionRef, xmlLength: xml.length });

  } catch(e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: "PATCH", headers: sbH,
      body: JSON.stringify({ ksef_status: "error", ksef_error: msg.slice(0,500) }),
    }).catch(() => {});
    return jsonRes({ error: msg }, 502);
  }
});
