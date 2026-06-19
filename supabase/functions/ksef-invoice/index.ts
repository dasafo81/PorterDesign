// supabase/functions/ksef-invoice/index.ts
// Pobiera XML pojedynczej faktury z KSeF i parsuje FA(3) do struktury JSON.
// POST { accessToken, baseUrl, ksefNumber }
// Zwraca: { xml, parsed: { seller, buyer, items, header, totals } }

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

// Prosta ekstrakcja wartości z XML (bez parsera DOM)
function xmlVal(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "i");
  return (xml.match(re)?.[1] || "").trim();
}
function xmlAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  return xml.match(re)?.[1] || "";
}
function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}
function xmlBlock(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "i");
  return xml.match(re)?.[0] || "";
}

function parseFA3(xml: string) {
  // Podmiot1 — sprzedawca
  const p1 = xmlBlock(xml, "Podmiot1");
  const seller = {
    nip:     xmlVal(p1, "NIP"),
    name:    xmlVal(p1, "PelnaNazwa") || xmlVal(p1, "Nazwa"),
    address: [xmlVal(p1, "Ulica"), xmlVal(p1, "NrDomu"), xmlVal(p1, "KodPocztowy"), xmlVal(p1, "Miejscowosc")]
               .filter(Boolean).join(" "),
  };

  // Podmiot2 — nabywca
  const p2 = xmlBlock(xml, "Podmiot2");
  const buyer = {
    nip:     xmlVal(p2, "NIP"),
    name:    xmlVal(p2, "PelnaNazwa") || xmlVal(p2, "Nazwa"),
    address: [xmlVal(p2, "Ulica"), xmlVal(p2, "NrDomu"), xmlVal(p2, "KodPocztowy"), xmlVal(p2, "Miejscowosc")]
               .filter(Boolean).join(" "),
  };

  // Nagłówek Fa
  const fa = xmlBlock(xml, "Fa");
  const header = {
    number:      xmlVal(fa, "P_2"),
    issueDate:   xmlVal(fa, "P_1"),
    saleDate:    xmlVal(fa, "P_1M") || xmlVal(fa, "P_6") || xmlVal(fa, "P_1"),
    currency:    xmlVal(fa, "KodWaluty") || "PLN",
    paymentForm: xmlVal(fa, "FormaPlatnosci") || xmlVal(fa, "P_22"),
    dueDate:     xmlVal(fa, "TerminPlatnosci") || xmlVal(fa, "DataZaplaty"),
    notes:       xmlVal(fa, "DodatkowyOpis") || xmlVal(fa, "P_Opis"),
    invoiceType: xmlVal(fa, "RodzajFaktury") || "VAT",
  };

  // Pozycje FaWiersz
  const itemBlocks = xmlAll(xml, "FaWiersz").length > 0
    ? xmlAll(xml, "FaWiersz")
    : xmlAll(xml, "Wiersz");

  // Jeśli xmlAll nie zwraca bloków — szukamy inaczej
  const items = itemBlocks.length > 0
    ? itemBlocks.map(block => ({
        no:       xmlVal(block, "NrWierszaFa") || "",
        name:     xmlVal(block, "P_7"),
        unit:     xmlVal(block, "P_8A"),
        qty:      parseFloat(xmlVal(block, "P_8B") || "1"),
        netPrice: parseFloat(xmlVal(block, "P_9A") || "0"),
        netVal:   parseFloat(xmlVal(block, "P_11") || "0"),
        vatRate:  xmlVal(block, "P_12"),
        grossVal: parseFloat(xmlVal(block, "P_11A") || "0"),
      }))
    : [];

  // Podsumowanie
  const totals = {
    net:   parseFloat(xmlVal(fa, "P_13_Razem") || xmlVal(fa, "P_15") || "0"),
    vat:   parseFloat(xmlVal(fa, "P_14_Razem") || "0"),
    gross: parseFloat(xmlVal(fa, "P_15") || "0"),
  };
  // Fallback z metadanych jeśli XML nie ma sum
  if (!totals.gross && items.length > 0) {
    totals.net = items.reduce((s, i) => s + i.netVal, 0);
  }

  return { seller, buyer, header, items, totals };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { accessToken, baseUrl, ksefNumber } = body;
  if (!accessToken || !baseUrl || !ksefNumber) {
    return jsonRes({ error: "accessToken, baseUrl, ksefNumber wymagane" }, 400);
  }

  // Pobierz XML z KSeF
  const r = await fetch(`${baseUrl}/invoices/ksef/${ksefNumber}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/xml, text/xml, */*" },
  });
  if (!r.ok) return jsonRes({ error: "KSeF GET invoice HTTP " + r.status, detail: await r.text() }, 502);

  const ct = r.headers.get("content-type") || "";
  let xml = "";
  if (ct.includes("json")) {
    const d = await r.json();
    if (d.invoiceData) {
      try { xml = atob(d.invoiceData); } catch { xml = d.invoiceData; }
    } else {
      xml = JSON.stringify(d);
    }
  } else {
    xml = await r.text();
  }

  const parsed = parseFA3(xml);
  return jsonRes({ ok: true, xml, parsed });
});
