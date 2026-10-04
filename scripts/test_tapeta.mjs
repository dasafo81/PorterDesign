// Kalkulacja produktu "Tapety ARTE" w wycenie (data.js: tapetaCalc / calc).
import assert from "node:assert/strict";
import { calc, tapetaCalc, setBuiltinCatalog, TAPETY } from "../src/constants/data.js";

setBuiltinCatalog(true);
var P = function (kod, par, c) { return { type: "tapeta", c: Object.assign({ tapKod: kod }, c || {}), par: par || {} }; };
var rol = TAPETY.find(function (t) { return t.jm === "rol" && t.brutto === 1319; });
var mb = TAPETY.find(function (t) { return t.jm === "mb" && t.brutto === 254; });
var szt = TAPETY.find(function (t) { return t.jm === "szt"; });

// rolka 53x1005, sciana 400x260, zapas 10%: 8 pasow po 286 cm, 3 pasy/rolke -> 3 rolki
var r = tapetaCalc(P(rol.name, { wallW: 400, wallH: 260, rollW: 53, rollL: 1005 }));
assert.equal(r.qty, 3); assert.equal(r.unit, "rol"); assert.equal(r.total, 3 * 1319);
assert.equal(calc(P(rol.name, { wallW: 400, wallH: 260, rollW: 53, rollL: 1005 })).total, 3 * 1319);

// dokladnie 1 pas = szerokosc rolki, bez bledu zmiennoprzecinkowego
assert.equal(tapetaCalc(P(rol.name, { wallW: 53, wallH: 250, rollW: 53, rollL: 1000 }, { tapZapas: "0" })).qty, 1);
// zapas 0: 1000/250 = 4 pasy z rolki, 8 pasow -> 2 rolki
assert.equal(tapetaCalc(P(rol.name, { wallW: 424, wallH: 250, rollW: 53, rollL: 1000 }, { tapZapas: "0" })).qty, 2);

// sciana wyzsza niz rolka -> ostrzezenie, brak ceny
var hi = tapetaCalc(P(rol.name, { wallW: 100, wallH: 1200, rollW: 53, rollL: 1005 }));
assert.equal(hi.total, 0); assert.ok(hi.warn);

// brak wymiarow rolki -> brak ceny, bez bledu
assert.equal(tapetaCalc(P(rol.name, { wallW: 400, wallH: 260 })).total, 0);

// mb: material 130, sciana 400x260, zapas 10%: 4 pasy x 286 = 1144 cm = 11,44 -> 11,5 mb
var m = tapetaCalc(P(mb.name, { wallW: 400, wallH: 260, matW: 130 }));
assert.equal(m.qty, 11.5); assert.equal(m.unit, "mb"); assert.equal(m.total, 11.5 * 254);

// szt: ilosc x cena, wymiary sciany niepotrzebne
assert.equal(tapetaCalc(P(szt.name, { qty: 2 })).total, 2 * szt.brutto);
assert.equal(tapetaCalc(P(szt.name, {})).total, szt.brutto);

// wpis reczny
var man = tapetaCalc(P("__manual__", { wallW: 300, wallH: 250, rollW: 70, rollL: 1000 }, { tapManJm: "rol", tapManCena: "450,50", tapManNazwa: "X" }));
assert.equal(man.qty, 2); assert.equal(man.total, 901);

// nieznany kod / katalog wylaczony
assert.equal(tapetaCalc(P("NIE_MA", { wallW: 1, wallH: 1 })).total, 0);
setBuiltinCatalog(false);
assert.equal(tapetaCalc(P(rol.name, { wallW: 400, wallH: 260, rollW: 53, rollL: 1005 })).total, 0);
console.log("tapeta: OK");
