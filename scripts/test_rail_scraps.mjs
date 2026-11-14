// Dobor scinkow szyn KS z magazynu do szyn z wyceny (data.js: matchRailScraps).
import assert from "node:assert/strict";
import { matchRailScraps, railScrapColorKey } from "../src/constants/data.js";

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
console.log("test_rail_scraps OK");
