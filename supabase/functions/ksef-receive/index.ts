// supabase/functions/ksef-receive/index.ts
// KSeF 2.0 — pobieranie faktur: metadane (lista) + pełny XML per faktura
// (numer, daty, kwoty, strony, pozycje) — wcześniej ta funkcja zapisywała
// wyłącznie dane z /invoices/query/metadata, co dawało faktury bez pozycji
// (invoice_items), bez adresu kontrahenta i bez terminu płatności (zawsze null).

const SB_URL = Deno.env.get("SB_URL") || "https://rkcidwusjzvfwxszotnb.supabase.co";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (!auth) return { ok: false, status: 401, message: "missing jwt" };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SVC, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: "invalid jwt" };
  const u = await r.json();
  const tid = u?.app_metadata?.tenant_id;
  if (!tid) return { ok: false, status: 403, message: "no tenant_id" };
  return { ok: true, tenantId: tid as string, service: SVC as string };
}

// ── XML helpers (regex — bez zewnętrznego parsera, spójne z api/ksef/receive.js) ──
function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp("<(?:[\\w]+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?" + tag + ">", "i"));
  return m ? m[1].trim() : "";
}
function xmlBlock(xml: string, tag: string): string {
  const m = xml.match(new RegExp("<(?:[\\w]+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?" + tag + ">", "i"));
  return m ? m[0] : "";
}
function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp("<(?:[\\w]+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?" + tag + ">", "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[0]);
  return out;
}
function numVal(s: unknown): number { return parseFloat(String(s || "").replace(",", ".")) || 0; }

// ── Twarda walidacja przed zapisem do bazy ─────────────────────────────────
// Regexowy parser XML potrafi trafic w nieoczekiwany tag (np. wyciagnal "Zielonka"
// do kolumny typu `date` => Postgres 22007 i porzucenie calej faktury). Do kolumn
// typowanych wpuszczamy WYLACZNIE wartosci poprawnego typu, w przeciwnym razie null/0.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function asDate(v: unknown, field: string, ksefNum: string): string | null {
  if (!v) return null;
  const s = String(v).trim().slice(0, 10);
  if (ISO_DATE_RE.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime())) return s;
  console.warn(`[ksef-receive] ${ksefNum}: odrzucono nieprawidlowa date w polu ${field}: ${JSON.stringify(String(v).slice(0, 60))}`);
  return null;
}
function asNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Doda N dni do daty YYYY-MM-DD, zwraca YYYY-MM-DD (lub null jesli data bazowa niepoprawna)
function addDays(dateStr: string, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Termin płatności — Platnosc→TerminPlatnosci→Termin (data) lub →Dni (liczba dni od wystawienia).
// WAŻNE: wczesniejsza wersja zwracała literalny string "14 dni" zamiast wyliczonej daty, co przy
// zapisie do kolumny typu `date` w Postgresie powodowało blad i porzucenie calego rekordu.
function parseDueDate(xml: string, fa: string, issueDate: string): string | null {
  const platnosc = xmlBlock(fa, "Platnosc") || xmlBlock(xml, "Platnosc");
  if (platnosc) {
    const tpBlock = xmlBlock(platnosc, "TerminPlatnosci");
    const termin = tpBlock ? (xmlVal(tpBlock, "Termin") || xmlVal(tpBlock, "Dni")) : "";
    if (termin) {
      if (/^\d{4}-\d{2}-\d{2}/.test(termin)) return termin.slice(0, 10);
      if (/^\d+$/.test(termin)) return addDays(issueDate, parseInt(termin, 10));
      return null;
    }
    const dz = xmlVal(platnosc, "DataZaplaty");
    if (dz && /^\d{4}-\d{2}-\d{2}/.test(dz)) return dz.slice(0, 10);
  }
  const raw = xmlVal(fa, "DataZaplaty") || xmlVal(fa, "TerminPlatnosci") || "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d+$/.test(raw)) return addDays(issueDate, parseInt(raw, 10));
  return null;
}

interface Party {
  nip: string; name: string; address: string; addrLine2: string;
  postal: string; city: string; email: string; phone: string;
}
function parseParty(block: string): Party {
  return {
    nip: xmlVal(block, "NIP"),
    name: xmlVal(block, "PelnaNazwa") || xmlVal(block, "Nazwa"),
    address: xmlVal(block, "AdresL1") || [xmlVal(block, "Ulica"), xmlVal(block, "NrDomu"), xmlVal(block, "NrLokalu")].filter(Boolean).join(" "),
    addrLine2: xmlVal(block, "AdresL2") || [xmlVal(block, "KodPocztowy"), xmlVal(block, "Miejscowosc")].filter(Boolean).join(" "),
    postal: xmlVal(block, "KodPocztowy"),
    city: xmlVal(block, "Miejscowosc"),
    email: xmlVal(block, "Email"),
    phone: xmlVal(block, "Telefon"),
  };
}

// Forma płatności (Platnosc/FormaPlatnosci) — kody wg FA(3), zgodnie z mapowaniem
// używanym już przy podglądzie faktur w ksef-invoice/index.ts.
const PAY_METHOD_MAP: Record<string, string> = {
  "1": "gotówka", "2": "przelew", "3": "karta", "4": "bon", "5": "czek",
  "6": "kredyt", "7": "mobilna", "8": "skonto",
};
function parsePaymentMethod(platnoscB: string): string {
  if (!platnoscB) return "przelew";
  const raw = xmlVal(platnoscB, "FormaPlatnosci");
  if (!raw) return "przelew";
  return PAY_METHOD_MAP[raw] || raw.toLowerCase();
}
// Platnosc/Zaplacono: "1"=Tak, "2"=Nie (ta sama konwencja co pozostale flagi Adnotacje
// w FA(3), np. P_17/P_18/P_19 — "2" jako domyslna odpowiedz przecząca). Dzięki temu
// np. faktura za paliwo pobrana z KSeF, opłacona od razu przy zakupie, trafia na listę
// z automatycznie odhaczonym "Zapłacono" zamiast wymagać ręcznego zaznaczenia.
function parsePaidFlag(platnoscB: string): boolean {
  if (!platnoscB) return false;
  return xmlVal(platnoscB, "Zaplacono") === "1";
}

function parseFA(xml: string) {
  const fa = xmlBlock(xml, "Fa");
  const p1 = xmlBlock(xml, "Podmiot1"); // sprzedawca na fakturze
  const p2 = xmlBlock(xml, "Podmiot2"); // nabywca na fakturze
  const seller = parseParty(p1);
  const buyer = parseParty(p2);
  const platnoscB = xmlBlock(fa, "Platnosc") || xmlBlock(xml, "Platnosc");
  const rachunek = platnoscB ? xmlBlock(platnoscB, "RachunekBankowy") : "";
  const bank = rachunek ? (xmlVal(rachunek, "NrRB") || xmlVal(rachunek, "IBAN") || "") : "";
  const issueDate = xmlVal(xml, "P_1");

  // total_net/total_vat: NIE czytamy P_13_Razem/P_14_Razem — takie tagi nie istnieją
  // w schemacie FA(3) (kwoty netto/VAT są tam rozbite per stawka: P_13_1/P_14_1 (23%),
  // P_13_2/P_14_2 (8%), P_13_3/P_14_3 (5%), P_13_6_1 (0%), P_13_7 (zw), nigdy jako jedna
  // suma). xmlVal(xml,"P_13_Razem") zawsze zwracał "" → 0, więc KAŻDA synchronizacja
  // z KSeF zerowała total_net/total_vat zapisanej faktury. Liczymy sumy z rzeczywistych
  // pozycji (parseItems już poprawnie czyta P_11/P_9A/P_12 per wiersz — na tym samym
  // opiera się zapis invoice_items chwilę niżej w handlerze).
  const faItems = parseItems(xml);
  const totalNetFromItems = +(faItems.reduce(function(s, it) { return s + (it.line_net || 0); }, 0)).toFixed(2);
  const totalVatFromItems = +(faItems.reduce(function(s, it) { return s + (it.line_vat || 0); }, 0)).toFixed(2);

  return {
    number: xmlVal(xml, "P_2") || xmlVal(xml, "NrFaKSeF"),
    issue_date: issueDate,
    // UWAGA: data sprzedazy to P_6 (data dokonania/zakonczenia dostawy lub uslugi).
    // P_1M to MIEJSCE wystawienia faktury (nazwa miejscowosci!) — czytanie stad daty
    // wrzucalo do kolumny `date` np. "Zielonka" => Postgres 22007 i utrata faktury.
    // Dla faktur okresowych P_6 moze byc zastapione przez OkresFa/P_6_Od.
    sale_date: xmlVal(xml, "P_6") || xmlVal(xml, "P_6_Od") || issueDate,
    due_date: parseDueDate(xml, fa, issueDate),
    // Wczesniej: `+(xmlVal(xml, "P_15") || 0)` — surowa konwersja JS bez przejscia przez
    // numVal(). Niektorzy dostawcy (KSeF) zapisuja P_15 z przecinkiem dziesietnym
    // ("1234,56"); `+"1234,56"` daje NaN, a NaN przy zapisie do bazy zamienial sie w 0.
    // Pozycje (P_9A/P_11/P_12) zawsze szly przez numVal (bezpieczny dla przecinka), wiec
    // faktura zapisywala sie z poprawnymi invoice_items, ale zerowym naglowkiem total_gross
    // — to bylo widoczne jako "faktury z kwota 0 zl mimo pozycji" (zgloszenie 2026-07-27).
    total_gross: numVal(xmlVal(xml, "P_15")),
    total_net: totalNetFromItems,
    total_vat: totalVatFromItems,
    currency: xmlVal(xml, "KodWaluty") || "PLN",
    notes: xmlVal(xml, "P_Opis"),
    payment_method: parsePaymentMethod(platnoscB),
    paid: parsePaidFlag(platnoscB),
    seller_party: seller, buyer_party: buyer, bank,
  };
}

// Pozycje faktury (FaWiersz, lub starszy wariant Wiersz). FA(3) dopuszcza dwa warianty
// zapisu ceny w wierszu: netto (P_9A cena jedn., P_11 wartość) — najczęstszy — albo
// brutto (P_9B cena jedn. brutto, P_11A wartość brutto, opcjonalnie P_11Vat kwota VAT) —
// używany np. przez niektórych dostawców (zaobserwowane: faktura 24834/8005/2026, gdzie
// P_9A/P_11 były puste, a realne kwoty siedziały w P_9B/P_11A/P_11Vat). Bez tego fallbacku
// taka pozycja liczyła się jako 0 netto/brutto, mimo że wiersz faktycznie miał kwotę.
function parseItems(xml: string) {
  let blocks = xmlAll(xml, "FaWiersz");
  if (blocks.length === 0) blocks = xmlAll(xml, "Wiersz");

  return blocks.map((w, i) => {
    const vatRraw = xmlVal(w, "P_12");
    const vatNum = (vatRraw === "zw" || vatRraw === "np") ? -1 : numVal(vatRraw);
    const qty = numVal(xmlVal(w, "P_8B") || "1");

    const hasNetSource = xmlVal(w, "P_9A") !== "" || xmlVal(w, "P_11") !== "";
    let netP: number, netV: number, vatV: number, grossV: number;

    if (hasNetSource) {
      netP = numVal(xmlVal(w, "P_9A"));
      netV = numVal(xmlVal(w, "P_11")) || +(netP * qty).toFixed(2);
      vatV = vatNum === -1 ? 0 : +(netV * (vatNum / 100)).toFixed(2);
      grossV = +(netV + vatV).toFixed(2);
    } else {
      const grossP = numVal(xmlVal(w, "P_9B"));
      grossV = numVal(xmlVal(w, "P_11A")) || +(grossP * qty).toFixed(2);
      const vatFromXml = numVal(xmlVal(w, "P_11Vat"));
      vatV = vatNum === -1 ? 0 : (vatFromXml || +(grossV - grossV / (1 + vatNum / 100)).toFixed(2));
      netV = +(grossV - vatV).toFixed(2);
      netP = qty ? +(netV / qty).toFixed(4) : netV;
    }

    return {
      position: i + 1,
      name: xmlVal(w, "P_7") || ("Pozycja " + (i + 1)),
      pkwiu: xmlVal(w, "PKWiU") || xmlVal(w, "P_2A") || "",
      unit: xmlVal(w, "P_8A") || "szt",
      quantity: qty || 1,
      unit_net: netP,
      vat_rate: vatNum,
      line_net: netV,
      line_vat: vatV,
      line_gross: grossV,
    };
  });
}

// ── Rate limiting KSeF ──────────────────────────────────────────────────────
// KSeF API 2.0 dopuszcza max 8 zadan/sekunde. Pobieranie XML w petli bez przerwy
// powodowalo HTTP 429 na wszystkich fakturach poza pierwszymi kilkoma (efekt: faktury
// bez pozycji i bez terminu platnosci). Trzymamy sie ~5 req/s z zapasem.
const KSEF_MIN_INTERVAL_MS = 150;
let ksefLastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Zapewnia minimalny odstep miedzy kolejnymi wywolaniami KSeF (globalnie dla tej instancji).
async function ksefThrottle(): Promise<void> {
  const now = Date.now();
  const wait = ksefLastCallAt + KSEF_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  ksefLastCallAt = Date.now();
}

// fetch do KSeF z throttlingiem i retry przy 429 (exponential backoff, respektuje Retry-After).
async function ksefFetch(url: string, init: RequestInit, maxRetries = 5): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await ksefThrottle();
    const r = await fetch(url, init);
    if (r.status !== 429 || attempt >= maxRetries) return r;
    // 429 — odczekaj i sprobuj ponownie. Retry-After (sekundy) ma pierwszenstwo.
    const retryAfter = parseInt(r.headers.get("retry-after") || "", 10);
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1000 * Math.pow(2, attempt), 8000);
    await r.body?.cancel().catch(() => {});
    await sleep(backoffMs);
  }
}

async function fetchInvoiceXml(baseUrl: string, accessToken: string, ksefNumber: string): Promise<{ xml: string | null; diag: string }> {
  let r: Response;
  try {
    r = await ksefFetch(`${baseUrl}/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/xml, text/xml, */*" },
    });
  } catch (e) {
    return { xml: null, diag: "fetch nie powiodl sie (siec/CORS?): " + (e instanceof Error ? e.message : String(e)) };
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    return { xml: null, diag: `HTTP ${r.status} ${r.statusText} z ${baseUrl}/invoices/ksef/${ksefNumber} — ${body.slice(0, 300)}` };
  }
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("json")) {
    const d = await r.json();
    if (d.invoiceData) {
      try { return { xml: decodeURIComponent(escape(atob(d.invoiceData))), diag: "" }; }
      catch { return { xml: d.invoiceData, diag: "" }; }
    }
    return { xml: null, diag: "odpowiedz JSON bez pola invoiceData: " + JSON.stringify(d).slice(0, 300) };
  }
  const text = await r.text();
  return { xml: text, diag: "" };
}

// KSeF odrzuca zapytanie o metadane, jesli dateRange przekracza 3 miesiace (blad 21405).
// Dzielimy zakres na okna po 80 dni (z zapasem wzgledem "3 miesiecy" = do 92 dni).
function dateWindows(from: string, to: string, maxDays = 80): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const end = new Date(to + "T00:00:00Z");
  let cur = new Date(from + "T00:00:00Z");
  if (isNaN(cur.getTime()) || isNaN(end.getTime()) || cur > end) return out;

  while (cur <= end) {
    const winEnd = new Date(cur);
    winEnd.setUTCDate(winEnd.getUTCDate() + maxDays - 1);
    const clamped = winEnd > end ? end : winEnd;
    out.push({ from: cur.toISOString().slice(0, 10), to: clamped.toISOString().slice(0, 10) });
    cur = new Date(clamped);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function queryMetadataWindow(
  baseUrl: string, accessToken: string, subjectType: string, from: string, to: string
): Promise<Record<string, unknown>[]> {
  const filters = {
    subjectType: subjectType === "subject1" ? "Subject1" : "Subject2",
    // "Issue" (data wystawienia) gubil faktury wystawione przez kontrahenta z data sprzed
    // okna syncu, ktore do KSeF trafily/staly sie trwale zapisane dopiero w oknie.
    // "Acquisition" nie jest tu obslugiwane przez KSeF (HTTP 400: nie da sie skonwertowac
    // na InvoiceQueryDateType) — dokumentacja KSeF wprost zaleca "PermanentStorage" do
    // przyrostowego pobierania faktur, bo jest odporne na asynchroniczne opoznienia procesu
    // przyjmowania danych (Issue/Invoicing moga dawac nieprzewidywalne wyniki przy oknach czasowych).
    dateRange: { from: from + "T00:00:00.000Z", to: to + "T23:59:59.999Z", dateType: "PermanentStorage" },
  };
  let all: Record<string, unknown>[] = [];
  let pageOffset = 0;
  const pageSize = 100;
  // UWAGA: pageOffset to NUMER STRONY (0,1,2...), a nie przesuniecie rekordu.
  // Wczesniej robilismy `pageOffset += pageSize`, wiec po pierwszej pelnej stronie
  // prosilismy o strone nr 100 => rekord 10 000 => KSeF 21405
  // ("You cannot retrieve invoices starting from number 10 000 or higher").
  // Nie ujawnialo sie przy oknie 30 dni, bo wyniki miescily sie na jednej stronie.
  // KSeF nie pozwala siegnac poza rekord 10 000, wiec max 99 stron po 100.
  for (pageOffset = 0; pageOffset < 99; pageOffset++) {
    const r = await ksefFetch(`${baseUrl}/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(filters),
    });
    if (!r.ok) throw new Error("KSeF query/metadata HTTP " + r.status + " (okno " + from + ".." + to + ", strona " + pageOffset + "): " + (await r.text()).slice(0, 300));
    const d = await r.json();
    const items = (d.invoices || d.items || d.invoiceMetadataList || []) as Record<string, unknown>[];
    all = all.concat(items);
    const hasMore = d.hasMore === true || items.length === pageSize;
    if (!hasMore || items.length === 0) break;
  }
  return all;
}

async function queryMetadata(
  baseUrl: string, accessToken: string, subjectType: string, from: string, to: string
): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>();
  const all: Record<string, unknown>[] = [];
  for (const win of dateWindows(from, to)) {
    const items = await queryMetadataWindow(baseUrl, accessToken, subjectType, win.from, win.to);
    for (const it of items) {
      // Deduplikacja na wypadek faktur pojawiajacych sie na styku okien
      const key = String(it.ksefNumber || it.ksefReferenceNumber || "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      all.push(it);
    }
  }
  return all;
}

async function saveInvoiceItems(invoiceId: string, items: Record<string, unknown>[], sbH: Record<string, string>, tenantId: string) {
  await fetch(`${SB_URL}/rest/v1/invoice_items?invoice_id=eq.${invoiceId}`, { method: "DELETE", headers: sbH });
  if (!items.length) return;
  // tenant_id MUSI byc podany jawnie: kolumna ma `not null default (auth.jwt()->'app_metadata'->>'tenant_id')`,
  // a Edge Function laczy sie przez service_role, ktorego JWT nie ma app_metadata.tenant_id => default = NULL
  // => naruszenie NOT NULL i cichy blad zapisu (faktury zapisywaly sie bez ani jednej pozycji).
  const r = await fetch(`${SB_URL}/rest/v1/invoice_items`, {
    method: "POST", headers: sbH,
    body: JSON.stringify(items.map((it) => ({ ...it, invoice_id: invoiceId, tenant_id: tenantId }))),
  });
  if (!r.ok) {
    throw new Error("zapis pozycji nie powiodl sie: HTTP " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
  }
}

// Jednorazowo wczytuje mape ksef_number -> id, zbior numerow ktore maja juz XML oraz
// zbior id faktur ktore maja juz pozycje. "Kompletna" faktura = ma XML *i* pozycje.
// Wczesniej robilismy to per faktura, a `select=id,xml_payload` sciagalo caly XML (dziesiatki kB)
// tylko po to, zeby sprawdzic czy jest niepusty — 58 takich zapytan zabijalo czas wykonania.
async function loadExisting(tenantId: string, sbH: Record<string, string>) {
  const idByKsef = new Map<string, string>();
  const byNumber = new Map<string, string>();  // doc_type+"|"+number -> id (fallback, patrz saveInvoices)
  const xmlPresent = new Set<string>();   // ksef_number
  const itemsPresent = new Set<string>(); // invoice_id

  // Kazde z tych zapytan MUSI sie udac. Wczesniej blad byl polykany (`if (r.ok)` bez `else`),
  // przez co zbiory wychodzily puste => nic nie bylo pomijane ani naprawiane, a kazdy sync
  // od nowa odpytywal KSeF o wszystkie faktury.
  const rAll = await fetch(`${SB_URL}/rest/v1/invoices?tenant_id=eq.${tenantId}&select=id,ksef_number,doc_type,number&limit=10000`, { headers: sbH });
  if (!rAll.ok) throw new Error("loadExisting/invoices HTTP " + rAll.status + ": " + (await rAll.text()).slice(0, 200));
  for (const row of await rAll.json()) {
    if (row.ksef_number) idByKsef.set(row.ksef_number, row.id);
    // Faktura wystawiona lokalnie i wyslana do KSeF czasem ma zapisany numer sesji
    // (sessionRef) zamiast finalnego ksef_number, jesli polling w ksef-send nie
    // zdazyl go potwierdzic. Dopasowanie po wlasnym numerze faktury ("8/07/2026")
    // pozwala sync'owi trafic w ten sam rekord zamiast tworzyc duplikat.
    if (row.number) byNumber.set(row.doc_type + "|" + row.number, row.id);
  }

  const rDone = await fetch(`${SB_URL}/rest/v1/invoices?tenant_id=eq.${tenantId}&xml_payload=not.is.null&select=ksef_number&limit=10000`, { headers: sbH });
  if (!rDone.ok) throw new Error("loadExisting/xml HTTP " + rDone.status + ": " + (await rDone.text()).slice(0, 200));
  for (const row of await rDone.json()) {
    if (row.ksef_number) xmlPresent.add(row.ksef_number);
  }

  const rItems = await fetch(`${SB_URL}/rest/v1/invoice_items?tenant_id=eq.${tenantId}&select=invoice_id&limit=50000`, { headers: sbH });
  if (!rItems.ok) throw new Error("loadExisting/items HTTP " + rItems.status + ": " + (await rItems.text()).slice(0, 200));
  for (const row of await rItems.json()) {
    if (row.invoice_id) itemsPresent.add(row.invoice_id);
  }

  return { idByKsef, byNumber, xmlPresent, itemsPresent };
}

// Pobiera zapisany wczesniej XML z bazy (bez odpytywania KSeF) — do naprawy faktur,
// ktore maja XML, ale nie maja pozycji (skutek wczesniejszego cichego bledu zapisu).
async function loadStoredXml(invoiceId: string, sbH: Record<string, string>): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}&select=xml_payload`, { headers: sbH });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0]?.xml_payload || null;
}

async function saveInvoices(
  metaHeaders: Record<string, unknown>[],
  baseUrl: string, accessToken: string, tenantId: string, service: string, docType: string,
  deadlineAt: number,
  existing: { idByKsef: Map<string, string>; byNumber: Map<string, string>; xmlPresent: Set<string>; itemsPresent: Set<string> }
): Promise<{ saved: number; repaired: number; skipped: number; remaining: number; errors: unknown[] }> {
  const sbH = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
  let saved = 0;
  let repaired = 0;
  let skipped = 0;
  let remaining = 0;
  const errors: unknown[] = [];
  const isIncoming = docType === "zakup";

  for (const meta of metaHeaders) {
    const ksefNum = String(meta.ksefNumber || meta.ksefReferenceNumber || "");
    if (!ksefNum) {
      errors.push({ ksefNum: "(brak)", err: "metadane bez ksefNumber/ksefReferenceNumber — pominieto: " + JSON.stringify(meta).slice(0, 200) });
      continue;
    }

    const existingId = existing.idByKsef.get(ksefNum);

    // Kompletna = ma XML *i* ma pozycje. Wtedy nic nie robimy (sync wznawialny).
    if (existing.xmlPresent.has(ksefNum) && existingId && existing.itemsPresent.has(existingId)) {
      skipped++; continue;
    }

    // Naprawa: XML jest juz w bazie, ale pozycji brak (skutek cichego bledu zapisu tenant_id,
    // lub zerowych pozycji sprzed poprawki wariantu brutto P_9B/P_11A). Odtwarzamy pozycje
    // z zapisanego XML — bez odpytywania KSeF, wiec bez throttle i szybko. WAZNE: przeliczamy
    // tez naglowek (total_net/total_vat/total_gross) z nowo odtworzonych pozycji — wczesniej
    // ta sciezka aktualizowala tylko invoice_items, wiec naprawiona faktura miala poprawne
    // pozycje, ale nadal zerowy naglowek (dokladnie ten objaw zgloszony 2026-07-27).
    if (existing.xmlPresent.has(ksefNum) && existingId) {
      try {
        const storedXml = await loadStoredXml(existingId, sbH);
        if (storedXml) {
          const repairedItems = parseItems(storedXml);
          await saveInvoiceItems(existingId, repairedItems, sbH, tenantId);
          const repairedNet = +(repairedItems.reduce((s, it) => s + (it.line_net || 0), 0)).toFixed(2);
          const repairedVat = +(repairedItems.reduce((s, it) => s + (it.line_vat || 0), 0)).toFixed(2);
          const repairedGross = +(repairedItems.reduce((s, it) => s + (it.line_gross || 0), 0)).toFixed(2);
          if (repairedNet > 0 || repairedGross > 0) {
            await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${existingId}`, {
              method: "PATCH", headers: sbH,
              body: JSON.stringify({ total_net: repairedNet, total_vat: repairedVat, total_gross: repairedGross, updated_at: new Date().toISOString() }),
            });
          }
          existing.itemsPresent.add(existingId);
          repaired++;
          continue;
        }
      } catch (e) {
        errors.push({ ksefNum, err: "naprawa pozycji: " + (e instanceof Error ? e.message : String(e)) });
        continue;
      }
    }

    // Budzet czasu: Edge Function ma twardy limit (~150 s) i po jego przekroczeniu gateway
    // zwraca 504, gubiac caly postep. Konczymy wczesniej i zwracamy ile zostalo — kolejne
    // klikniecie "Synchronizuj" dobierze reszte, bo gotowe faktury sa pomijane.
    if (Date.now() > deadlineAt) { remaining++; continue; }

    try {
      let ex = existing.idByKsef.get(ksefNum);
      const { xml, diag } = await fetchInvoiceXml(baseUrl, accessToken, ksefNum);
      // Brak XML (blad sieci / KSeF chwilowo niedostepne) nie moze skutkowac zapisem "pustej"
      // faktury ani nadpisaniem juz poprawnie zapisanej (brak pozycji, brak danych kontrahenta,
      // brak terminu platnosci) — pomijamy, sync mozna powtorzyc pozniej.
      if (!xml) { errors.push({ ksefNum, err: diag || "brak XML z KSeF — pominieto" }); continue; }
      const parsed = parseFA(xml);

      // Fallback: dopasowanie po ksef_number zawiodlo (np. lokalna faktura ma zapisany
      // numer sesji zamiast finalnego numeru KSeF — polling w ksef-send nie potwierdzil
      // go na czas). Probujemy po wlasnym numerze faktury (doc_type+number), zanim
      // zdecydujemy sie utworzyc nowy rekord — bez tego kazdy taki przypadek dawal duplikat.
      if (!ex && parsed.number) {
        const fallbackId = existing.byNumber.get(docType + "|" + parsed.number);
        if (fallbackId) ex = fallbackId;
      }

      // Dla faktur zakupowych prawdziwy sprzedawca (kontrahent zewnętrzny) trzymamy w seller_snapshot,
      // a buyer_* = my (Porter Design) — spójnie z api/ksef/receive.js i logiką PDF.
      const sellerSnapshot = isIncoming ? {
        name: parsed.seller_party.name || "", nip: parsed.seller_party.nip || "",
        address: parsed.seller_party.address || "", postal: "", city: parsed.seller_party.addrLine2 || "",
        bank: parsed.bank || "", email: parsed.seller_party.email || "", phone: parsed.seller_party.phone || "",
      } : {};
      const buyerParty = isIncoming ? parsed.seller_party : parsed.buyer_party;

      // Metadane KSeF maja wlasne issueDate — uzywamy go jako fallbacku, gdy data z XML
      // nie przejdzie walidacji (lista faktur sortuje po issue_date, wiec null bylby bolesny).
      const metaIssue = String(meta.issueDate || "").slice(0, 10);

      const record: Record<string, unknown> = {
        tenant_id: tenantId, doc_type: docType, status: isIncoming ? "received" : "issued",
        direction: isIncoming ? "zakup" : "sprzedaz",
        ksef_status: "confirmed", ksef_number: ksefNum, ksef_mode: "online",
        number: parsed.number || ksefNum,
        issue_date: asDate(parsed.issue_date, "issue_date", ksefNum) || asDate(metaIssue, "meta.issueDate", ksefNum),
        sale_date: asDate(parsed.sale_date, "sale_date", ksefNum) || asDate(metaIssue, "meta.issueDate", ksefNum),
        due_date: asDate(parsed.due_date, "due_date", ksefNum),
        total_net: asNum(parsed.total_net), total_vat: asNum(parsed.total_vat), total_gross: asNum(parsed.total_gross),
        currency: parsed.currency || "PLN", notes: parsed.notes || "",
        payment_method: parsed.payment_method || "przelew",
        buyer_name: buyerParty.name || "", buyer_nip: buyerParty.nip || "",
        buyer_address: buyerParty.address || "", buyer_postal: "", buyer_city: buyerParty.addrLine2 || "",
        seller_snapshot: sellerSnapshot, xml_payload: xml, updated_at: new Date().toISOString(),
      };
      // Faktura ma w XML jawne "Zaplacono=1" (np. paragon-faktura za paliwo, opłacona od razu
      // przy zakupie) — odhaczamy "Zapłacono" automatycznie. Gdy XML tego nie potwierdza,
      // NIE nadpisujemy payment_status na "unpaid" przy każdym sync — to nadpisałoby ręczne
      // odhaczenie zrobione wcześniej w aplikacji.
      if (parsed.paid) {
        record.payment_status = "paid";
        record.paid_amount = asNum(parsed.total_gross);
      }

      let invoiceId: string | null = null;
      if (ex) {
        invoiceId = ex;
        const up = await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, { method: "PATCH", headers: sbH, body: JSON.stringify(record) });
        if (!up.ok) throw new Error("PATCH invoices HTTP " + up.status + ": " + (await up.text()).slice(0, 200));
        existing.idByKsef.set(ksefNum, invoiceId);
      } else {
        const ins = await fetch(`${SB_URL}/rest/v1/invoices`, { method: "POST", headers: sbH, body: JSON.stringify(record) });
        if (!ins.ok) throw new Error("POST invoices HTTP " + ins.status + ": " + (await ins.text()).slice(0, 200));
        const insRows = await ins.json();
        invoiceId = insRows?.[0]?.id || null;
        if (!invoiceId) throw new Error("POST invoices nie zwrocil id");
        existing.idByKsef.set(ksefNum, invoiceId);
      }
      await saveInvoiceItems(invoiceId, parseItems(xml), sbH, tenantId);
      existing.itemsPresent.add(invoiceId);
      existing.xmlPresent.add(ksefNum);
      saved++;
    } catch (e) {
      errors.push({ ksefNum, err: e instanceof Error ? e.message : String(e) });
    }
  }
  return { saved, repaired, skipped, remaining, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const startedAt = Date.now();
  ksefLastCallAt = 0; // reset throttle na nowe zadanie (isolate moze byc wspoldzielony)

  const auth = await verifyUser(req);
  if (!auth.ok) return jsonRes({ error: auth.message }, auth.status);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }

  const { accessToken, baseUrl, direction, dateFrom, dateTo } = body;
  if (!accessToken || !baseUrl) return jsonRes({ error: "accessToken i baseUrl wymagane" }, 400);

  const now = new Date();
  const from = String(dateFrom || new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const to   = String(dateTo   || now.toISOString().slice(0, 10));
  const dir  = String(direction || "all");

  try {
    let inH: Record<string, unknown>[] = [];
    let outH: Record<string, unknown>[] = [];
    if (dir === "incoming" || dir === "all") inH  = await queryMetadata(baseUrl as string, accessToken as string, "subject2", from, to);
    if (dir === "outgoing" || dir === "all") outH = await queryMetadata(baseUrl as string, accessToken as string, "subject1", from, to);

    // DEBUG TYMCZASOWY (do usuniecia po diagnozie): zrzut surowych metadanych z KSeF
    // do logow Edge Function — zeby ustalic czy brakujaca faktura w ogole jest w odpowiedzi
    // KSeF (a ginie dopiero w naszym przetwarzaniu), czy KSeF jej nam w ogole nie zwraca
    // (blad zapytania/kontekstu sesji). Sprawdzic w Supabase Dashboard -> Edge Functions ->
    // ksef-receive -> Logs, szukajac "DEBUG" i NIP-u kontrahenta bez myslnikow (np. 5831932281).
    console.log("DEBUG incoming count:", inH.length, JSON.stringify(inH));
    console.log("DEBUG outgoing count:", outH.length, JSON.stringify(outH));

    // Budzet czasu na przetwarzanie faktur — zostawiamy margines przed twardym limitem
    // Edge Function (~150 s), zeby zdazyc zwrocic odpowiedz zamiast dostac 504 z gatewaya.
    const deadlineAt = startedAt + 95_000;
    const sbH = { apikey: auth.service, Authorization: `Bearer ${auth.service}`, "Content-Type": "application/json", Prefer: "return=representation" };
    const existing = await loadExisting(auth.tenantId, sbH);

    // UWAGA: sekwencyjnie, nie Promise.all — rownolegle wywolania podwajaly tempo zapytan
    // do KSeF i omijaly wspolny throttle (limit 8 zad./s => HTTP 429).
    const empty = { saved: 0, repaired: 0, skipped: 0, remaining: 0, errors: [] as unknown[] };
    const inRes  = inH.length  ? await saveInvoices(inH,  baseUrl as string, accessToken as string, auth.tenantId, auth.service, "zakup", deadlineAt, existing) : empty;
    const outRes = outH.length ? await saveInvoices(outH, baseUrl as string, accessToken as string, auth.tenantId, auth.service, "vat",   deadlineAt, existing) : empty;

    const remaining = inRes.remaining + outRes.remaining;
    const repaired = inRes.repaired + outRes.repaired;
    return jsonRes({
      ok: true,
      remaining,
      repaired,
      incoming: { fetched: inH.length,  saved: inRes.saved,  repaired: inRes.repaired,  skipped: inRes.skipped,  errors: inRes.errors.length  ? inRes.errors  : undefined },
      outgoing: { fetched: outH.length, saved: outRes.saved, repaired: outRes.repaired, skipped: outRes.skipped, errors: outRes.errors.length ? outRes.errors : undefined },
    });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
