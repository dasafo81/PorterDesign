// Moduł poduszek wg notatki: cennik (rozmiar × model szycia), wkład, pasmanteria,
// tkanina z opcją przekręcenia, wiersze zamówienia / szycia.
import assert from "node:assert/strict";
import { calc, pillowCalc, pillowSewPrice, pillowSizeTier, pillowFabricLayout, pillowFabricMetry,
  buildOfferDetailRows, buildSewingRows, buildFabricRows, costOf } from "../src/constants/data.js";

var pil = function (c, par, extra) {
  return Object.assign({ type: "inny", innyKat: "poduszki", innyNazwa: "Poduszki", mp: null,
    c: Object.assign({ pdModel: "basic" }, c), par: Object.assign({ wCm: 50, hCm: 50, qty: 1 }, par),
    fabMan: 100, fabManName: "Velvet", fabW: 140 }, extra);
};

// cennik szycia: [zakup netto, klient brutto]
assert.deepEqual(pillowSewPrice("basic", 60, 40), { cost: 30, client: 60 });
assert.deepEqual(pillowSewPrice("basic", 45, 45), { cost: 30, client: 60 });
assert.deepEqual(pillowSewPrice("basic", 65, 45), { cost: 30, client: 60 });
assert.deepEqual(pillowSewPrice("basic", 50, 50), { cost: 35, client: 70 });
assert.deepEqual(pillowSewPrice("basic", 55, 55), { cost: 35, client: 70 });
assert.deepEqual(pillowSewPrice("basic", 70, 50), { cost: 40, client: 80 });
assert.deepEqual(pillowSewPrice("basic", 50, 70), { cost: 40, client: 80 }, "rozmiar odwrócony = ten sam");
assert.deepEqual(pillowSewPrice("basic", 70, 70), { cost: 40, client: 80 });
assert.deepEqual(pillowSewPrice("ryszka", 60, 40), { cost: 40, client: 80 });
assert.deepEqual(pillowSewPrice("lamowka", 55, 55), { cost: 45, client: 90 });
assert.deepEqual(pillowSewPrice("ryszka", 70, 70), { cost: 50, client: 100 });
assert.equal(pillowSewPrice("basic", 52, 52), null, "rozmiar spoza cennika");
assert.equal(pillowSewPrice("inne", 50, 50), null, "model inne = tylko cena własna");
assert.equal(pillowSizeTier(51, 50), -1);

// układ tkaniny: 50×50 → pas 53 × 116 cm; belka 140 cm
var p1 = pil({}, { qty: 1 });
assert.deepEqual(pillowFabricLayout(p1, false), { mb: 1.2, rotated: false }); // 116 cm → 1,2 mb
assert.deepEqual(pillowFabricLayout(p1, true), { mb: 0.6, rotated: true });   // 53 cm → 0,6 mb
assert.ok(pillowFabricLayout(p1, true).mb < pillowFabricLayout(p1, false).mb, "przekręcona = mniej metrów");
assert.equal(pillowFabricMetry(p1), 1.2);
assert.equal(pillowFabricMetry(pil({ pdRot: "tak" })), 0.6);
// poszewka szersza niż belka → układ wymuszony (obrót), nawet bez zaznaczenia
assert.deepEqual(pillowFabricLayout(pil({}, { wCm: 70, hCm: 50 }, { fabW: 60 }), false).rotated, true);
// nie mieści się w żaden sposób → 0
assert.equal(pillowFabricMetry(pil({}, {}, { fabW: 40 })), 0);

// wycena: szycie basic 70 + tkanina 1,2 mb × 100 = 190
var r1 = calc(p1);
assert.equal(r1.total, 190);
assert.match(r1.lines.join("|"), /Szycie poszewki 50×50 cm · Basic 70,00 zł\/szt\./);
assert.match(r1.lines.join("|"), /Tkanina 1,2 mb × 100,00 zł/);
// przekręcona: tanio — 70 + 0,6 × 100 = 130
assert.equal(calc(pil({ pdRot: "tak" })).total, 130);
assert.match(calc(pil({ pdRot: "tak" })).lines.join("|"), /przekręcona/);
// ilość ×3: szycie 210; tkanina — 2 szt. w rzędzie (140/53) → 2 rzędy × 116 = 2,4 mb → 240
assert.equal(calc(pil({}, { qty: 3 })).total, 210 + 240);
// ryszka 90 (55×55)
assert.equal(calc(pil({ pdModel: "ryszka" }, { wCm: 55, hCm: 55 })).total, 90 + pillowFabricMetry(pil({}, { wCm: 55, hCm: 55 })) * 100);
// wkład mały / duży (zł/szt. × ilość)
assert.equal(calc(pil({ pdWklad: "maly" }, { qty: 2 })).total, calc(pil({}, { qty: 2 })).total + 40);
assert.equal(calc(pil({ pdWklad: "duzy" }, { qty: 2 })).total, calc(pil({}, { qty: 2 })).total + 60);
// pasmanteria: baza basic + doszycie 20 zł/mb + ręczny koszt pasmanterii za mb, × ilość
var pp = pil({ pdModel: "pasmanteria", pdPasMb: "2,5", pdPasKoszt: "8" }, { qty: 2 });
var base = calc(pil({}, { qty: 2 })).total;
assert.equal(calc(pp).total, base + 2 * 2.5 * 20 + 2 * 2.5 * 8);
assert.match(calc(pp).lines.join("|"), /Doszycie pasmanterii 2,5 mb/);
// pasmanteria bez metrów = sam model basic; długość ignorowana poza modelem pasmanteria
assert.equal(calc(pil({ pdModel: "pasmanteria" })).total, 190);
assert.equal(calc(pil({ pdModel: "basic", pdPasMb: 5 })).total, 190);
// cena własna zastępuje cennik (szycie), model "inne" wymaga ceny własnej
assert.equal(calc(pil({ innyCena: "100" })).total, 100 + 120);
assert.equal(calc(pil({ pdModel: "inne" })).total, 0);
assert.match(calc(pil({ pdModel: "inne" })).warn, /cen[ęe] własn/);
assert.equal(calc(pil({ pdModel: "inne", innyCena: "55" })).total, 55 + 120);
assert.match(calc(pil({}, { wCm: 52, hCm: 52 })).warn, /spoza cennika/);
// brak tkaniny → ostrzeżenie, nie cicha cena
assert.equal(calc(pil({}, {}, { fabMan: null, fabManName: null })).total, 0);
assert.equal(calc(pil({}, {}, { fabMan: null, fabManName: null })).warn, "Wybierz tkaninę");

// zużycie dla kosztu własnego: tkanina z cennika, szycie ×2 marża
var u = calc(pil({ pdWklad: "maly" }, { qty: 1 })).usage;
assert.equal(u.fabMb, 1.2);
assert.equal(u.fabSell, 120);
assert.equal(u.sewSell, 70 + 20);

// starsza pozycja bez modelu — dawne liczenie: cena za szt. × ilość, bez tkaniny
var legacy = Object.assign(pil({}, { qty: 3 }), { c: { innyCena: "250" } });
assert.equal(calc(legacy).total, 750);

// druk Zamówienia i zlecenie szycia
var client = { name: "T", rooms: [{ name: "Salon", windows: [{ name: "Okno", products: [
  pil({ pdModel: "pasmanteria", pdPasMb: 2, pdWklad: "duzy", pdRot: "tak", kolor: "03" }, { qty: 2 })
] }] }] };
var o = buildOfferDetailRows(client)[0];
assert.equal(o.cat, "poduszki");
assert.equal(o.modelSzycia, "Pasmanteria (2 mb)");
assert.equal(o.wypelnienie, "Wkład duży");
assert.equal(o.rozmiar, "50 × 50 cm");
var s = buildSewingRows(client)[0];
assert.equal(s.szStyle, "Pasmanteria");
assert.match(s.note, /Wkład duży/);
assert.match(s.note, /pasmanterię 2 mb\/szt\./);
assert.match(s.note, /przekręcona/);
var f = buildFabricRows(client)[0];
assert.equal(f.metry, pillowFabricMetry(client.rooms[0].windows[0].products[0]));
assert.match(f.note, /przekręcona/);

console.log("test_pillows OK");
