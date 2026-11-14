// Dobor scinkow szyn KS z magazynu do szyn z wyceny (data.js: matchRailScraps).
import assert from "node:assert/strict";
import { matchRailScraps, planRailScraps, railScrapColorKey } from "../src/constants/data.js";

var szyna = function (len, kk, qty) { return { type: "szyna", c: { ks: "flex", kk: kk }, par: { len: len, qty: qty || 1 } }; };
var client = function (prods) { return { rooms: [{ name: "Salon", windows: [{ name: "Okno 1", products: prods }] }] }; };
var scrap = function (id, len, color, type) { return { id: id, length_cm: len, color: color, rail_type: type || "KS" }; };

assert.equal(railScrapColorKey("Biała"), "bialy");
assert.equal(railScrapColorKey("bialy"), "bialy");
assert.equal(railScrapColorKey("czarna"), "czarny");
assert.equal(railScrapColorKey("off white"), "offwhite");

// najkrotszy pasujacy scinek, kolor musi sie zgadzac
var r = matchRailScraps(client([szyna(200, "biala")]), [scrap("a", 350, "biała"), scrap("b", 210, "biała"), scrap("c", 205, "czarna")]);
assert.equal(r.length, 1); assert.equal(r[0].scrap.id, "b"); assert.equal(r[0].spare, 10);

// qty=2 -> dwa odcinki, kazdy scinek uzyty raz; trzeci brak
r = matchRailScraps(client([szyna(200, "biala", 3)]), [scrap("a", 250, "biała"), scrap("b", 200, "biała")]);
assert.equal(r.length, 3); assert.equal(r.filter(function (n) { return n.scrap; }).length, 2);
assert.equal(new Set(r.filter(function (n) { return n.scrap; }).map(function (n) { return n.scrap.id; })).size, 2);

// za krotki scinek, inny typ szyny, brak scinkow -> brak dopasowania
assert.equal(matchRailScraps(client([szyna(300, "biala")]), [scrap("a", 299, "biała")])[0].scrap, null);
assert.equal(matchRailScraps(client([szyna(100, "biala")]), [scrap("a", 500, "biała", "DS")])[0].scrap, null);
assert.equal(matchRailScraps(client([szyna(100, "czarna")]), [])[0].scrap, null);

// brak szyn w wycenie / pusty klient
assert.equal(matchRailScraps(client([{ type: "zaslona", c: {}, par: {} }]), [scrap("a", 500, "biała")]).length, 0);
assert.equal(matchRailScraps({}, []).length, 0);
// dwa odcinki 250 z jednej szyny 580 (nie zuzywamy dwoch szyn)
var pl = planRailScraps(client([szyna(250, "biala", 2)]), [scrap("a", 580, "biała"), scrap("b", 580, "biała")]);
assert.equal(pl.rails.length, 1); assert.equal(pl.rails[0].spare, 80);
assert.deepEqual(pl.needs.map(function (n) { return n.railNo; }), [1, 1]);

// 465 + 250 + 240 przy trzech 580: 465 osobno (zostaje 115), 250 + 240 razem na drugiej -> 2 szyny
pl = planRailScraps(client([szyna(465, "biala"), szyna(250, "biala"), szyna(240, "biala")]),
  [scrap("a", 580, "biała"), scrap("b", 580, "biała"), scrap("c", 580, "biała")]);
assert.equal(pl.rails.length, 2);
assert.equal(pl.rails[0].cuts.length + pl.rails[1].cuts.length, 3);
assert.equal(pl.rails[0].spare, 115); assert.equal(pl.rails[1].spare, 90);

// odcinki nie mieszaja kolorow na jednej szynie; za malo szyn -> brak dla reszty
pl = planRailScraps(client([szyna(100, "biala"), szyna(100, "czarna")]), [scrap("a", 580, "biała")]);
assert.equal(pl.rails.length, 1); assert.equal(pl.needs.filter(function (n) { return !n.scrap; }).length, 1);
pl = planRailScraps(client([szyna(300, "biala", 2)]), [scrap("a", 580, "biała")]);
assert.equal(pl.needs.filter(function (n) { return n.scrap; }).length, 1);
console.log("test_rail_scraps OK");
