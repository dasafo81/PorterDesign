// supabase/functions/ksef-send/index.ts
// KSeF 2.0 — wysyłanie faktury sprzedażowej (FA(3) XML).
// POST { invoiceId, accessToken, baseUrl }
//   → pobiera fakturę + pozycje z Supabase
//   → generuje XML FA(3)
//   → POST /invoices (KSeF 2.0)
//   → zapisuje ksef_number / ksef_status w Supabase

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
    status,
    headers: { "Content-Type": "application/json", ...cors() },
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
  if (rate === 23) return "A";
  if (rate === 8)  return "B";
  if (rate === 5)  return "C";
  if (rate === 0)  return "D";
  if (rate === -1) return "E";
  return "A";
}

function round2(n: number): number { return Math.round((+(n || 0)) * 100) / 100; }
function fmt2(n: number): string   { return round2(n).toFixed(2); }

function escXml(s: unknown): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// deno-lint-ignore no-explicit-any
function buildFA3(inv: Record<string, any>, items: Record<string, any>[], settings: Record<string, any>): string {
  const s = inv.seller_snapshot || {};
  const sellerNip = (s.nip || settings.seller_nip || "").replace(/[\s\-]/g, "");
  const buyerNip  = (inv.buyer_nip || "").replace(/[\s\-]/g, "");

  // Grupowanie pozycji po stawce VAT
  const vatGroups: Record<string, { net: number; vat: number }> = {};
  for (const it of (items || [])) {
    const k = String(it.vat_rate);
    if (!vatGroups[k]) vatGroups[k] = { net: 0, vat: 0 };
    vatGroups[k].net += round2(it.line_net);
    vatGroups[k].vat += round2(it.line_vat);
  }

  const totalNet   = fmt2(items.reduce((a, i) => a + round2(i.line_net),   0));
  const totalVat   = fmt2(items.reduce((a, i) => a + round2(i.line_vat),   0));
  const totalGross = fmt2(items.reduce((a, i) => a + round2(i.line_gross), 0));

  const pozycje = items.map((it, idx) => {
    const vc = vatCode(it.vat_rate);
    return `
    <FaWiersz>
      <NrWierszaFa>${idx + 1}</NrWierszaFa>
      <P_7>${escXml(it.name || "")}</P_7>
      <P_8A>${escXml(it.unit || "szt")}</P_8A>
      <P_8B>${fmt2(it.quantity)}</P_8B>
      <P_9A>${fmt2(it.unit_net)}</P_9A>
      <P_11>${fmt2(it.line_net)}</P_11>
      <P_12>${it.vat_rate === -1 ? "zw" : fmt2(it.vat_rate)}</P_12>
      <P_12_XII>${vc}</P_12_XII>
      <P_13>${fmt2(it.line_vat)}</P_13>
      ${it.pkwiu ? `<PKWiU>${escXml(it.pkwiu)}</PKWiU>` : ""}
    </FaWiersz>`;
  }).join("");

  const stawki = Object.keys(vatGroups).map((k) => {
    const g = vatGroups[k];
    const vc = vatCode(+k);
    return `
    <P_13_${vc}>${fmt2(g.net)}</P_13_${vc}>
    <P_14_${vc}>${fmt2(g.vat)}</P_14_${vc}>`;
  }).join("");

  const payMap: Record<string, string> = { "przelew": "6", "gotówka": "1", "karta": "5", "BLIK": "5" };
  const payCode = payMap[inv.payment_method || ""] || "6";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/types"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <DataWytworzeniaFa>${new Date().toISOString().replace("Z", "+00:00")}</DataWytworzeniaFa>
    <NrFaKSeF>${escXml(inv.number || "")}</NrFaKSeF>
    <SystemInfo>PorterDesign</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${escXml(sellerNip)}</NIP>
      <PelnaNazwa>${escXml(s.name || settings.seller_name || "")}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escXml((s.address || settings.seller_address || "") + " " + (s.postal || settings.seller_postal || ""))}</AdresL1>
      <AdresL2>${escXml(s.city || settings.seller_city || "")}</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      ${buyerNip ? `<NIP>${escXml(buyerNip)}</NIP>` : ""}
      <PelnaNazwa>${escXml(inv.buyer_name || "")}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escXml((inv.buyer_address || "") + " " + (inv.buyer_postal || ""))}</AdresL1>
      <AdresL2>${escXml(inv.buyer_city || "")}</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${isoDate(inv.issue_date)}</P_1>
    <P_1M>${isoDate(inv.sale_date || inv.issue_date)}</P_1M>
    <P_2>${escXml(inv.number || "")}</P_2>
    <P_15>${totalGross}</P_15>
    <Adnotacje>
      <P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>
      <P_19>2</P_19><P_22>2</P_22><P_23>2</P_23><P_PMarzy>2</P_PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    ${inv.notes ? `<DodatkowyOpis><P_Opis>${escXml(inv.notes)}</P_Opis></DodatkowyOpis>` : ""}
    ${pozycje}
    <Rozliczenie>
      ${stawki}
      <P_13_Razem>${totalNet}</P_13_Razem>
      <P_14_Razem>${totalVat}</P_14_Razem>
    </Rozliczenie>
    <Platnosc>
      <Zaplacono>2</Zaplacono>
      <DataZaplaty>${isoDate(inv.due_date)}</DataZaplaty>
      <FormaPlatnosci>${payCode}</FormaPlatnosci>
      ${(s.bank || settings.seller_bank) ? `<NrRachunku>${escXml((s.bank || settings.seller_bank || "").replace(/\s/g, ""))}</NrRachunku>` : ""}
    </Platnosc>
  </Fa>
</Faktura>`;
}

async function sha256b64(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { invoiceId, accessToken, baseUrl } = body;
  if (!invoiceId || !accessToken || !baseUrl)
    return jsonRes({ error: "invoiceId, accessToken i baseUrl są wymagane" }, 400);

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Pobierz fakturę + pozycje + ustawienia
  const [invR, settR] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}&tenant_id=eq.${auth.tenantId}&select=*,invoice_items(*)`, { headers: sbH }),
    fetch(`${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=*`, { headers: sbH }),
  ]);
  if (!invR.ok) return jsonRes({ error: "Błąd pobierania faktury z DB" }, 500);
  const invRows = await invR.json();
  const inv = invRows?.[0];
  if (!inv) return jsonRes({ error: "Faktura nie znaleziona lub brak dostępu" }, 404);
  if (inv.status !== "issued") return jsonRes({ error: "Tylko wystawione faktury można wysłać do KSeF" }, 400);
  if (inv.ksef_status === "confirmed") return jsonRes({ error: `Faktura już potwierdzona w KSeF (nr: ${inv.ksef_number})` }, 400);

  const settings = settR.ok ? ((await settR.json()) || [])[0] || {} : {};
  const items = inv.invoice_items || [];

  // Generuj XML FA(3)
  const xml = buildFA3(inv, items, settings);

  // KSeF 2.0: POST /invoices z base64 XML w invoiceBody
  const xmlBytes = new TextEncoder().encode(xml);
  const xmlB64 = btoa(String.fromCharCode(...xmlBytes));
  const hashVal = await sha256b64(xml);

  const sendR = await fetch(`${baseUrl}/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      invoiceHash: {
        fileSize: xmlBytes.length,
        hashSHA: { algorithm: "SHA-256", encoding: "Base64", value: hashVal },
      },
      invoicePayload: {
        type: "plain",
        invoiceBody: xmlB64,
      },
    }),
  });

  const sendText = await sendR.text();
  if (!sendR.ok) {
    await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: "PATCH", headers: sbH,
      body: JSON.stringify({ ksef_status: "error", ksef_error: sendText.slice(0, 500) }),
    });
    return jsonRes({ error: "KSeF odrzucił fakturę", detail: sendText }, 502);
  }

  let sendData: Record<string, string> = {};
  try { sendData = JSON.parse(sendText); } catch { /* ignore */ }

  const ksefNumber = sendData.ksefReferenceNumber || sendData.referenceNumber || "";
  const ksefStatus = ksefNumber ? "confirmed" : "sent";

  await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
    method: "PATCH", headers: sbH,
    body: JSON.stringify({
      ksef_status: ksefStatus,
      ksef_number: ksefNumber || null,
      ksef_mode: "online",
      ksef_sent_at: new Date().toISOString(),
      ksef_error: null,
      xml_payload: xml,
    }),
  });

  return jsonRes({ ok: true, ksefStatus, ksefNumber, xmlLength: xml.length });
});
