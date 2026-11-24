// Druk "Zamówienie" (data.js: OFFER_TABLES / buildOfferDetailRows / buildOfferPDFHtml):
// osobna tabela per kategoria produktu, pomieszczenie tylko nad tabelą, ilość na końcu.
import assert from "node:assert/strict";
import { buildOfferDetailRows, buildOfferPDFHtml, OFFER_TABLES, offerExtraFields } from "../src/constants/data.js";

var prod = function (type, extra) { return Object.assign({ type: type, mp: 100, c: {}, par: {} }, extra); };
var client = {
  name: "Test", addr: "",
  rooms: [{ name: "Salon", windows: [{ name: "Okno 1", products: [
    prod("zaslona", { fabName: "Test", c: { bottomType: "double", bottomSize: 8, podszewka: "tak", leadInSides: true, split: "left" }, par: { wCm: 300, hCm: 250 } }),
    prod("roleta", { c: { rModel: "relax", rSystem: "manual", lancuszek: "metalowy", kolorLancuszka: "zloty", rMask: "tak", stronaObslugi: "Prawo" }, par: { wCm: 100, hCm: 150 } }),
    prod("szyna", { c: { ks: "wave", kk: "czarna", km: "sciana", kmWall: "podwojny" }, par: { len: 300, arc: 1.5, pts: 2, qty: 2 } }),
    prod("karnisz_dek", { kdRozmiar: 20, kdKolor: "nikiel", kdSzyny: [{ len: 240, qty: 2 }], kdAkc: { uch_suf: 4, lac_szyny: 1 } }),
    prod("shuttle", { c: { motorSide: "prawo", motorType: "kurtyna", shUch: "alu75", shFes: "snap", shFesKrot: 100 }, par: { len: 400 } }),
    prod("inny", { innyKat: "poduszki", innyNazwa: "Poduszki", innyTkanina: "Velvet 12", par: { wCm: 50, hCm: 50, qty: 4 } }),
    prod("inny", { innyKat: "panele", innyNazwa: "Panele tapicerowane", par: { qty: 3 } }),
    prod("inny", { innyKat: "dywan", innyNazwa: "Dywan", par: { qty: 1 } })
  ] }] }]
};

var rows = buildOfferDetailRows(client);
var cats = rows.map(function (r) { return r.cat; });
assert.deepEqual(cats, ["zaslony", "rolety", "karn_man", "karn_man", "karn_el", "poduszki", "panele", "inne"]);

assert.equal(rows[0].typDolu, "Podwójny 8 cm");
assert.match(rows[0].dodatki, /Podszewka.*Ołów w bokach/);
assert.equal(rows[1].kolorLancuszka, "Złoty");
assert.equal(rows[1].mechanizm, "Manualny");
assert.equal(rows[1].dodatki, "Boczki / maskownice");
assert.doesNotMatch(rows[1].tkaninaKolor, /łańcuszek/);
assert.equal(rows[2].typZaslony, "Wave");
assert.equal(rows[2].giecie, "łuk 1,5 mb, 2 pkt");
assert.equal(rows[2].typUchwytu, "Ścienny podwójny");
assert.equal(rows[3].szerokosc, "240 cm ×2");
assert.equal(rows[3].typUchwytu, "Uchwyt sufitowy ×4"); // łącznik szyny to nie uchwyt
assert.equal(rows[4].stronaSilnika, "Prawo");
assert.match(rows[4].akcesoria, /FES SNAP 100%/);
assert.match(rows[4].typUchwytu, /Ścienny ALU 7,5 cm/);
assert.equal(rows[5].rozmiar, "50 × 50 cm");
assert.equal(rows[5].qty, 4);

// kolumny: ilość zawsze ostatnia, pomieszczenie nie jest kolumną
OFFER_TABLES.forEach(function (t) {
  assert.equal(t.cols[t.cols.length - 1][1] === "_qty" || t.cat === "panele", true, t.cat);
  var w = t.cols.reduce(function (a, c) { return a + parseInt(c[2]); }, 0);
  assert.ok(w >= 99 && w <= 101, t.cat + " szerokości=" + w);
});
assert.deepEqual(OFFER_TABLES.find(function (t) { return t.cat === "karn_man"; }).cols.map(function (c) { return c[0]; }),
  ["Produkt", "Model karnisza", "Kolor", "Długość", "Typ zasłony", "Gięcie", "Typ uchwytu", "Ilość"]);
assert.deepEqual(offerExtraFields("poduszki").map(function (f) { return f.key; }), ["rozmiar", "wypelnienie"]);

var html = buildOfferPDFHtml(client, 0, 0, "", null, 0, 0);
assert.ok(html);
["Zasłony i firany", "Rolety rzymskie", "Karnisze manualne", "Karnisze elektryczne", "Poduszki i narzuty", "Panele tapicerowane", "Pozostałe produkty"].forEach(function (t) {
  assert.ok(html.indexOf("<caption>" + t + "</caption>") >= 0, t);
});
assert.ok(html.indexOf(">Salon</div>") >= 0);
assert.ok(html.indexOf("— Salon") < 0, "pomieszczenie nie może być w wierszu produktu");
console.log("test_offer_tables OK");
