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
    paymentForm: (() => {
      const raw = xmlVal(fa, "FormaPlatnosci") || xmlVal(fa, "P_22") || "";
      const map: Record<string,string> = {
        "1":"gotówka","2":"przelew","3":"karta","4":"bon","5":"czek",
        "6":"akredytywa","7":"mobilna","gotowka":"gotówka","przelew":"przelew",
      };
      return map[raw.toLowerCase()] || map[raw] || raw;
    })(),
    dueDate: (() => {
      // TerminPlatnosci zawiera zagniezdzone <Termin>data</Termin> lub <Dni>N</Dni>
      const block = xmlBlock(fa, "TerminPlatnosci") || "";
      const termin = block ? (xmlVal(block, "Termin") || xmlVal(block, "DataZaplaty") || xmlVal(block, "Dni") || "") : "";
      const raw = termin || xmlVal(fa, "DataZaplaty") || "";
      if (!raw) return "";
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      if (/^\d+$/.test(raw)) return raw + " dni";
      return raw;
    })(),
    notes: (() => {
      // DodatkowyOpis zawiera <Klucz>...</Klucz><Wartosc>...</Wartosc>
      const raw = xmlVal(fa, "DodatkowyOpis") || xmlVal(fa, "P_Opis") || "";
      // Wyciągnij wartości z <Wartosc> jeśli to struktura XML
      const wartosc = raw.match(/<(?:[^:>]+:)?Wartosc[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Wartosc>/gi);
      if (wartosc && wartosc.length > 0) {
        return wartosc.map(w => w.replace(/<[^>]+>/g, "").trim()).join(" | ");
      }
      return raw;
    })(),
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
  // FA(3): P_13_x to sumy netto per stawka VAT, P_14_x to sumy VAT per stawka
  // P_13_Razem/P_14_Razem to łączne sumy (opcjonalne), P_15 = brutto do zapłaty
  const netRaw   = xmlVal(fa, "P_13_Razem") || "";
  const vatRaw   = xmlVal(fa, "P_14_Razem") || "";
  const grossRaw = xmlVal(fa, "P_15")       || "";
  let netVal   = parseFloat(netRaw)   || 0;
  let vatVal   = parseFloat(vatRaw)   || 0;
  let grossVal = parseFloat(grossRaw) || 0;
  // Fallback: jeśli nie ma sum zbiorczych, zsumuj z pozycji
  if (!netVal && items.length > 0) netVal = items.reduce((s, i) => s + (i.netVal || 0), 0);
  // Jeśli brutto = 0 lub równe netto (błąd parsowania) — oblicz z netto+VAT
  if (!grossVal || Math.abs(grossVal - netVal) < 0.01) grossVal = netVal + vatVal;
  const totals = { net: netVal, vat: vatVal, gross: grossVal };

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
