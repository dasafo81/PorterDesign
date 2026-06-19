// supabase/functions/ksef-invoice/index.ts
// Pobiera XML FA(3) z KSeF i parsuje do JSON.
// POST { accessToken, baseUrl, ksefNumber }

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

// Wyciąga tekst z pierwszego pasującego tagu (z opcjonalnym prefixem ns)
function v(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i"));
  return (m?.[1] || "").trim();
}
// Wyciąga cały element (z tagami) — do dalszego parsowania
function block(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i"));
  return m?.[0] || "";
}
// Wyciąga wszystkie wystąpienia zawartości tagu
function all(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}
function num(s: string): number { return parseFloat(s.replace(",", ".")) || 0; }
function fmt(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mapa form płatności FA(3)
const PAY_MAP: Record<string, string> = {
  "1":"gotówka","2":"przelew","3":"karta płatnicza","4":"bon","5":"czek",
  "6":"kredyt","7":"mobilna","8":"skonto",
  "gotowka":"gotówka","gotówka":"gotówka","przelew":"przelew",
  "karta":"karta płatnicza","czek":"czek","bon":"bon",
};

function parseFA3(xml: string) {
  // ── Podmiot1 (sprzedawca) ─────────────────────────────────────────────────
  const p1 = block(xml, "Podmiot1");
  const seller = {
    nip:     v(p1, "NIP"),
    name:    v(p1, "PelnaNazwa") || v(p1, "Nazwa"),
    street:  v(p1, "AdresL1") || [v(p1, "Ulica"), v(p1, "NrDomu"), v(p1, "NrLokalu")].filter(Boolean).join(" "),
    city:    v(p1, "AdresL2") || [v(p1, "KodPocztowy"), v(p1, "Miejscowosc")].filter(Boolean).join(" "),
    country: v(p1, "KodKraju") || "PL",
    email:   v(p1, "Email"),
    phone:   v(p1, "Telefon"),
    regon:   v(p1, "REGON"),
  };

  // ── Podmiot2 (nabywca) ────────────────────────────────────────────────────
  const p2 = block(xml, "Podmiot2");
  const buyer = {
    nip:     v(p2, "NIP"),
    name:    v(p2, "PelnaNazwa") || v(p2, "Nazwa"),
    street:  v(p2, "AdresL1") || [v(p2, "Ulica"), v(p2, "NrDomu"), v(p2, "NrLokalu")].filter(Boolean).join(" "),
    city:    v(p2, "AdresL2") || [v(p2, "KodPocztowy"), v(p2, "Miejscowosc")].filter(Boolean).join(" "),
    country: v(p2, "KodKraju") || "PL",
    email:   v(p2, "Email"),
    phone:   v(p2, "Telefon"),
  };

  // ── Sekcja Fa (nagłówek) ──────────────────────────────────────────────────
  const fa = block(xml, "Fa");

  // Termin płatności — w sekcji Platnosc[]/TerminPlatnosci lub DataZaplaty
  // FA(3) struktura: <Platnosc><TerminPlatnosci><Termin>data</Termin></TerminPlatnosci></Platnosc>
  // Lub prosto: <DataZaplaty>data</DataZaplaty> albo <TerminPlatnosci>data</TerminPlatnosci>
  function parseDueDate(): string {
    // Próba 1: <Platnosc> → <TerminPlatnosci> → <Termin>
    const platnosc = block(fa, "Platnosc") || block(xml, "Platnosc");
    if (platnosc) {
      const tpBlock = block(platnosc, "TerminPlatnosci");
      const termin = tpBlock ? (v(tpBlock, "Termin") || v(tpBlock, "Dni")) : "";
      if (termin) {
        if (/^\d{4}-\d{2}-\d{2}/.test(termin)) return termin.slice(0, 10);
        if (/^\d+$/.test(termin)) return termin + " dni";
        return termin;
      }
      // Próba 2: <DataZaplaty> w <Platnosc>
      const dz = v(platnosc, "DataZaplaty");
      if (dz) return dz.slice(0, 10);
    }
    // Próba 3: bezpośrednio w <Fa>
    const raw = v(fa, "DataZaplaty") || v(fa, "TerminPlatnosci") || "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    // Próba 4: wyciągnij datę z zagnieżdżonego <Termin> jeśli raw zawiera XML
    if (raw.includes("<")) {
      const inner = v(raw, "Termin") || v(raw, "DataZaplaty");
      if (inner && /^\d{4}-\d{2}-\d{2}/.test(inner)) return inner.slice(0, 10);
    }
    return raw;
  }

  // Forma płatności — w <Platnosc> lub <FormaPlatnosci>
  function parsePayForm(): string {
    const platnosc = block(fa, "Platnosc") || block(xml, "Platnosc");
    const raw = (platnosc ? v(platnosc, "FormaPlatnosci") : "") || v(fa, "FormaPlatnosci") || v(fa, "P_22") || "";
    return PAY_MAP[raw.toLowerCase()] || PAY_MAP[raw] || raw || "przelew";
  }

  // Numer konta bankowego
  function parseBankAccount(): string {
    const platnosc = block(fa, "Platnosc") || block(xml, "Platnosc");
    if (!platnosc) return "";
    const rb = block(platnosc, "RachunekBankowy");
    const nr = rb ? (v(rb, "NrRB") || v(rb, "IBAN") || "") : "";
    const bank = rb ? v(rb, "NazwaBanku") : "";
    if (!nr) return "";
    // Formatuj numer rachunku co 4 cyfry
    const fmtNr = nr.replace(/(.{4})/g, "$1 ").trim();
    return bank ? fmtNr + " (" + bank.trim() + ")" : fmtNr;
  }

  // Uwagi — DodatkowyOpis lub StopkaFaktury
  function parseNotes(): string {
    const raw = v(fa, "DodatkowyOpis") || v(xml, "StopkaFaktury") || "";
    if (!raw) return "";
    // Wyciągnij <Wartosc> jeśli jest strukturą
    const wartosci = all(raw, "Wartosc");
    if (wartosci.length > 0) return wartosci.join(" | ");
    // Usuń tagi XML jeśli są
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const header = {
    number:      v(fa, "P_2"),
    invoiceType: v(fa, "RodzajFaktury") || "VAT",
    issueDate:   v(fa, "P_1"),
    saleDate:    v(fa, "P_6") || v(fa, "P_1"),  // P_1M = miasto wystawienia, nie data
    currency:    v(fa, "KodWaluty") || "PLN",
    paymentForm: parsePayForm(),
    dueDate:     parseDueDate(),
    bankAccount: parseBankAccount(),
    notes:       parseNotes(),
    // Dodatkowe pola FA(3)
    gtus:        ["GTU_01","GTU_02","GTU_03","GTU_04","GTU_05","GTU_06","GTU_07",
                  "GTU_08","GTU_09","GTU_10","GTU_11","GTU_12","GTU_13"]
                  .filter(g => fa.includes(`<${g}`) || fa.includes(`:${g}`)),
    mpp:         fa.includes("MPP") ? "TAK" : "",
  };

  // ── Pozycje FaWiersz ──────────────────────────────────────────────────────
  const wierszeBlocks = all(xml, "FaWiersz").length > 0
    ? (() => { const re = new RegExp(`<(?:[\\w]+:)?FaWiersz(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?FaWiersz>`, "gi"); const o=[]; let m; while((m=re.exec(xml))!==null) o.push(m[0]); return o; })()
    : (() => { const re = new RegExp(`<(?:[\\w]+:)?Wiersz(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?Wiersz>`, "gi"); const o=[]; let m; while((m=re.exec(xml))!==null) o.push(m[0]); return o; })();

  const items = wierszeBlocks.map(w => {
    const netP  = num(v(w, "P_9A"));   // cena jedn. netto
    const grossP = num(v(w, "P_9B") || v(w, "P_9C") || ""); // cena jedn. brutto (jeśli jest)
    const netV  = num(v(w, "P_11"));   // wartość netto
    const grossV = num(v(w, "P_11A") || ""); // wartość brutto (opcjonalne)
    const vatR  = v(w, "P_12");
    const qty   = num(v(w, "P_8B") || "1");
    // Oblicz brakujące
    const vatNum = vatR === "zw" || vatR === "np" ? 0 : num(vatR);
    const computedGrossP = grossP || (netP * (1 + vatNum / 100));
    const computedGrossV = grossV || (netV * (1 + vatNum / 100));
    const vatV  = computedGrossV - netV;

    return {
      no:       v(w, "NrWierszaFa"),
      name:     v(w, "P_7"),
      pkwiu:    v(w, "PKWiU") || v(w, "P_2A"),
      unit:     v(w, "P_8A"),
      qty,
      netPrice:   netP,
      grossPrice: parseFloat(computedGrossP.toFixed(2)),
      netVal:     netV,
      grossVal:   parseFloat(computedGrossV.toFixed(2)),
      vatRate:    vatR,
      vatVal:     parseFloat(vatV.toFixed(2)),
      gtu:        v(w, "GTU"),
    };
  });

  // ── Podsumowanie ──────────────────────────────────────────────────────────
  // Szukaj sum w Fa, Rozliczenie lub oblicz z pozycji
  const rozliczenie = block(xml, "Rozliczenie") || block(xml, "SumyVat") || fa;

  // Próbuj różne pola sum
  let netTotal   = num(v(rozliczenie, "P_13_Razem") || v(rozliczenie, "WartoscNetto") || "");
  let vatTotal   = num(v(rozliczenie, "P_14_Razem") || v(rozliczenie, "KwotaVat")    || "");
  let grossTotal = num(v(rozliczenie, "P_15")       || v(rozliczenie, "WartoscBrutto") || "");

  // Fallback z pozycji
  if (!netTotal && items.length > 0) netTotal = parseFloat(items.reduce((s,i) => s + i.netVal, 0).toFixed(2));
  if (!vatTotal && items.length > 0) vatTotal = parseFloat(items.reduce((s,i) => s + i.vatVal, 0).toFixed(2));
  if (!grossTotal) grossTotal = parseFloat((netTotal + vatTotal).toFixed(2));

  // Sumy VAT per stawka
  const vatRates: Record<string, {net: number, vat: number, gross: number}> = {};
  for (const item of items) {
    const r = item.vatRate || "23";
    if (!vatRates[r]) vatRates[r] = { net: 0, vat: 0, gross: 0 };
    vatRates[r].net   += item.netVal;
    vatRates[r].vat   += item.vatVal;
    vatRates[r].gross += item.grossVal;
  }

  return { seller, buyer, header, items, totals: { net: netTotal, vat: vatTotal, gross: grossTotal }, vatRates };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { accessToken, baseUrl, ksefNumber } = body;
  if (!accessToken || !baseUrl || !ksefNumber)
    return jsonRes({ error: "accessToken, baseUrl, ksefNumber wymagane" }, 400);

  const r = await fetch(`${baseUrl}/invoices/ksef/${ksefNumber}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/xml, text/xml, */*" },
  });
  if (!r.ok) return jsonRes({ error: "KSeF GET invoice HTTP " + r.status, detail: await r.text() }, 502);

  const ct = r.headers.get("content-type") || "";
  let xml = "";
  if (ct.includes("json")) {
    const d = await r.json();
    xml = d.invoiceData ? (() => { try { return atob(d.invoiceData); } catch { return d.invoiceData; } })() : JSON.stringify(d);
  } else {
    xml = await r.text();
  }

  const parsed = parseFA3(xml);
  return jsonRes({ ok: true, xml, parsed });
});
