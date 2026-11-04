import assert from "node:assert/strict";
import fs from "node:fs";
import { transformSync } from "esbuild"; // zależność Vite — działa na Node 20 (CI), w odróżnieniu od module.stripTypeScriptTypes

// Test kontraktowy generatora XML FA(3) dla faktur (w tym korygujących) z supabase/functions/ksef-send.
// Funkcja jest w Deno (import z esm.sh, Deno.serve), więc wycinamy z niej wyłącznie czystą logikę
// XML — od helperów isoDate/vatCode/... do znacznika FA3-END — i ładujemy w Node bez zależności.
const src = fs.readFileSync("supabase/functions/ksef-send/index.ts", "utf8");
const from = src.indexOf("function isoDate(");
const to = src.indexOf("// ── FA3-END ──");
assert.ok(from > 0 && to > from, "nie znaleziono bloku FA3 w ksef-send/index.ts");
const js = transformSync(src.slice(from, to), { loader: "ts" }).code;
const { buildFA3 } = new Function(js + "\nreturn { buildFA3 };")();

const settings = { seller_nip: "1234563218", seller_name: "Porter Design", seller_address: "ul. Testowa 1", seller_postal: "00-001", seller_city: "Warszawa" };
const item = (position, name, qty, unitNet, rate, extra = {}) => {
  const net = Math.round(qty * unitNet * 100) / 100;
  const vat = rate === -1 ? 0 : Math.round(net * rate) / 100;
  return { position, name, quantity: qty, unit: "szt", unit_net: unitNet, vat_rate: rate, line_net: net, line_vat: vat, line_gross: net + vat, pkwiu: "", ...extra };
};
const baseInv = {
  number: "FV/1/11/2026", issue_date: "2026-11-02", sale_date: "2026-11-02", due_date: "2026-11-16",
  payment_method: "przelew", buyer_name: "Jan Kowalski", buyer_nip: "5260250274", buyer_address: "ul. Kwiatowa 1",
  buyer_postal: "00-950", buyer_city: "Warszawa", notes: "", seller_snapshot: {},
};
const order = (xml, ...tags) => {
  let last = -1;
  for (const t of tags) {
    const i = xml.indexOf("<" + t + ">");
    assert.ok(i > last, `element <${t}> powinien wystąpić po poprzednim (kolejność FA(3)); pozycja ${i} <= ${last}`);
    last = i;
  }
};
const count = (xml, re) => (xml.match(re) || []).length;

// ── 1. Zwykła faktura VAT: bez zmian względem dotychczasowego zachowania ──────────────────────
{
  const xml = buildFA3({ ...baseInv, doc_type: "vat" }, [item(1, "Zasłony", 2, 100, 23)], settings);
  assert.match(xml, /<RodzajFaktury>VAT<\/RodzajFaktury>/);
  assert.doesNotMatch(xml, /DaneFaKorygowanej|StanPrzed|TypKorekty|PrzyczynaKorekty/);
  assert.match(xml, /<P_13_1>200\.00<\/P_13_1><P_14_1>46\.00<\/P_14_1>/);
  assert.match(xml, /<P_15>246\.00<\/P_15>/);
  assert.match(xml, /<TerminPlatnosci><Termin>2026-11-16<\/Termin><\/TerminPlatnosci>/);
  assert.equal(count(xml, /<FaWiersz>/g), 1);
}

// ── 2. Korekta in minus do faktury potwierdzonej w KSeF (obniżona cena) ───────────────────────
{
  const before = [item(1, "Zasłony", 1, 100, 23)];
  const inv = {
    ...baseInv, doc_type: "korekta", number: "KOR/1/11/2026", issue_date: "2026-11-05",
    corrects_invoice_id: "x", correction_reason: "Rabat posprzedażowy", correction_type: 2,
    correction_original: { original: { number: "FV/1/11/2026" }, buyer: {}, items: before },
  };
  const after = [item(1, "Zasłony", 1, 80, 23, { corrected_position: 1 })];
  const xml = buildFA3(inv, after, settings, { number: "FV/1/11/2026", issueDate: "2026-11-02", ksefNumber: "1234563218-20261102-AAAAAA-BB" });
  assert.match(xml, /<RodzajFaktury>KOR<\/RodzajFaktury>/);
  assert.match(xml, /<PrzyczynaKorekty>Rabat posprzedażowy<\/PrzyczynaKorekty>/);
  assert.match(xml, /<TypKorekty>2<\/TypKorekty>/);
  assert.match(xml, /<DataWystFaKorygowanej>2026-11-02<\/DataWystFaKorygowanej>/);
  assert.match(xml, /<NrFaKorygowanej>FV\/1\/11\/2026<\/NrFaKorygowanej>/);
  assert.match(xml, /<NrKSeF>1<\/NrKSeF><NrKSeFFaKorygowanej>1234563218-20261102-AAAAAA-BB<\/NrKSeFFaKorygowanej>/);
  assert.doesNotMatch(xml, /NrKSeFN/);
  // P_13/P_14/P_15 to różnice (ujemne dla korekty in minus)
  assert.match(xml, /<P_13_1>-20\.00<\/P_13_1><P_14_1>-4\.60<\/P_14_1>/);
  assert.match(xml, /<P_15>-24\.60<\/P_15>/);
  // Dwa wiersze tej samej linii: stan przed (StanPrzed=1) i po — ten sam NrWierszaFa
  assert.equal(count(xml, /<FaWiersz>/g), 2);
  assert.equal(count(xml, /<NrWierszaFa>1<\/NrWierszaFa>/g), 2);
  assert.equal(count(xml, /<StanPrzed>1<\/StanPrzed>/g), 1);
  assert.match(xml, /<P_9A>100\.00<\/P_9A>[\s\S]*<StanPrzed>1<\/StanPrzed>[\s\S]*<P_9A>80\.00<\/P_9A>/);
  // Korekta in minus to zwrot — bez terminu płatności
  assert.doesNotMatch(xml, /TerminPlatnosci/);
  assert.doesNotMatch(xml, /Podmiot2K/);
  order(xml, "Podmiot2", "Fa", "P_1", "P_2", "P_6", "P_13_1", "P_15", "Adnotacje", "RodzajFaktury",
    "PrzyczynaKorekty", "TypKorekty", "DaneFaKorygowanej", "FaWiersz", "Platnosc");
}

// ── 3. Korekta in plus: usunięta pozycja + dodana pozycja + inna stawka; faktura poza KSeF ────
{
  const before = [item(1, "Zasłony", 1, 100, 23), item(2, "Karnisz", 1, 50, 8)];
  const inv = {
    ...baseInv, doc_type: "korekta", number: "KOR/2/11/2026", issue_date: "2026-11-06",
    correction_reason: "Zmiana zakresu zamówienia", correction_type: 1,
    correction_original: { original: {}, buyer: {}, items: before },
  };
  const after = [
    item(1, "Zasłony", 1, 100, 23, { corrected_position: 1 }),
    item(2, "Montaż", 1, 200, 23),            // nowa pozycja (bez corrected_position)
  ];
  const xml = buildFA3(inv, after, settings, { number: "FV/1/11/2026", issueDate: "2026-11-02", ksefNumber: null });
  assert.match(xml, /<NrKSeFN>1<\/NrKSeFN>/);
  assert.doesNotMatch(xml, /NrKSeFFaKorygowanej/);
  assert.match(xml, /<TypKorekty>1<\/TypKorekty>/);
  // 23%: +200 netto (+46 VAT); 8%: -50 netto (-4 VAT); razem brutto = 246 - 54 = 192
  assert.match(xml, /<P_13_1>200\.00<\/P_13_1><P_14_1>46\.00<\/P_14_1>/);
  assert.match(xml, /<P_13_2>-50\.00<\/P_13_2><P_14_2>-4\.00<\/P_14_2>/);
  assert.match(xml, /<P_15>192\.00<\/P_15>/);
  // Usunięta pozycja 2 -> tylko wiersz "przed"; dodana -> nowy numer (3), tylko "po"
  assert.equal(count(xml, /<StanPrzed>1<\/StanPrzed>/g), 2);          // Zasłony(przed) + Karnisz(przed)
  assert.equal(count(xml, /<NrWierszaFa>2<\/NrWierszaFa>/g), 1);       // Karnisz tylko "przed"
  assert.equal(count(xml, /<NrWierszaFa>3<\/NrWierszaFa>/g), 1);       // Montaż tylko "po"
  assert.match(xml, /<TerminPlatnosci>/);                               // dopłata => termin
}

// ── 4. Korekta danych nabywcy (zły NIP) => Podmiot2K ze stanem PRZED ──────────────────────────
{
  const before = [item(1, "Zasłony", 1, 100, 23)];
  const inv = {
    ...baseInv, doc_type: "korekta", number: "KOR/3/11/2026", buyer_nip: "5260250274",
    correction_reason: "Błędny NIP nabywcy", correction_type: 2,
    correction_original: {
      original: {}, items: before,
      buyer: { name: "Jan Kowalski", nip: "1111111111", address: "ul. Kwiatowa 1", postal: "00-950", city: "Warszawa" },
    },
  };
  const after = [item(1, "Zasłony", 1, 100, 23, { corrected_position: 1 })];
  const xml = buildFA3(inv, after, settings, { number: "FV/1/11/2026", issueDate: "2026-11-02", ksefNumber: "K-1" });
  assert.match(xml, /<Podmiot2K>[\s\S]*<NIP>1111111111<\/NIP>[\s\S]*<\/Podmiot2K>/);
  assert.match(xml, /<Podmiot2>[\s\S]*<NIP>5260250274<\/NIP>/);
  assert.match(xml, /<P_15>0\.00<\/P_15>/);
  assert.doesNotMatch(xml, /<P_13_1>/); // brak różnic kwotowych — bez zer w sumach
  order(xml, "RodzajFaktury", "TypKorekty", "DaneFaKorygowanej", "Podmiot2K", "FaWiersz");
}

// ── 5. Brak odniesienia do faktury korygowanej => błąd (nie wysyłamy "korekty znikąd") ────────
assert.throws(() => buildFA3({ ...baseInv, doc_type: "korekta", correction_original: { items: [] } }, [], settings, null), /Brak danych faktury korygowanej/);

// ── 6. Specjalne znaki w przyczynie są escapowane, a XML jest poprawnie sformułowany ─────────
{
  const inv = { ...baseInv, doc_type: "korekta", correction_reason: 'Rabat <5%> & "inne"', correction_type: 2,
    correction_original: { original: {}, buyer: {}, items: [item(1, "A", 1, 10, 23)] } };
  const xml = buildFA3(inv, [item(1, "A", 1, 5, 23, { corrected_position: 1 })], settings, { number: "FV/9", issueDate: "2026-01-01", ksefNumber: null });
  assert.match(xml, /Rabat &lt;5%&gt; &amp; &quot;inne&quot;/);
  fs.writeFileSync(process.env.KOR_XML_OUT || "/dev/null", xml);
}

console.log("KSeF correction (FA(3) KOR) contract tests: OK");
