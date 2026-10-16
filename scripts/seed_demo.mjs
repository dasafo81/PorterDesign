// Zaklada konto demo My DecoLab: tenant (is_demo) + uzytkownik + fikcyjni klienci, wyceny i oferty.
// Uzycie:
//   SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD=... node scripts/seed_demo.mjs [--reset] [--dry-run]
// Opcjonalnie: SUPABASE_URL, DEMO_EMAIL (domyslnie demo@mydecolab.pl).
// Skrypt jest idempotentny: gdy tenant demo istnieje, bez --reset nic nie dodaje;
// z --reset kasuje dane demo (klienci, oferty, kontrahenci) i zaklada je od nowa.
import { calc, mg, getPanelsForProd, setBuiltinCatalog } from "../src/constants/data.js";

setBuiltinCatalog(true);

var DRY = process.argv.includes("--dry-run");
var RESET = process.argv.includes("--reset");
var SB_URL = process.env.SUPABASE_URL || "https://rkcidwusjzvfwxszotnb.supabase.co";
var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var EMAIL = process.env.DEMO_EMAIL || "demo@mydecolab.pl";
var PASSWORD = process.env.DEMO_PASSWORD;
var TENANT_NAME = "Studio Dekoracji Demo";

if (!DRY && (!KEY || !PASSWORD)) {
  console.error("Brak SUPABASE_SERVICE_ROLE_KEY lub DEMO_PASSWORD (min. 8 znakow). Dodaj --dry-run, by tylko policzyc dane.");
  process.exit(1);
}

// ── Generatory produktow (ceny liczy prawdziwe calc() z aplikacji) ───────────
var uid = 0;
function id() { return "demo_" + (++uid); }
function zaslona(name, wCm, hCm, fabName, fabPerMb, opts) {
  opts = opts || {};
  var p = { id: id(), type: "zaslona", name: name, fabName: fabName, fabMan: fabPerMb, fabW: 300,
    c: Object.assign({ mars: "2", model: "tasma", split: "equal" }, opts), par: { wCm: wCm, hCm: hCm } };
  p.panels = getPanelsForProd(p);
  return p;
}
function firana(name, wCm, hCm, fabName, fabPerMb) {
  var p = { id: id(), type: "firana", name: name, fabName: fabName, fabMan: fabPerMb, fabW: 300,
    c: { mars: "2", model: "tasma", split: "left" }, par: { wCm: wCm, hCm: hCm } };
  p.panels = getPanelsForProd(p);
  return p;
}
function zaluzja(jt, wCm, lCm) { return { id: id(), type: "zaluzja", c: { jt: jt }, par: { wCm: wCm, lCm: lCm } }; }
function inny(nazwa, cena, qty) { return { id: id(), type: "inny", innyKat: "inny", innyNazwa: nazwa, c: { innyCena: String(cena) }, par: { qty: qty || 1 } }; }

var rid = 1000;
function room(name, windows) {
  rid++;
  return { id: rid, name: name, img: null, windows: windows.map(function (w, i) {
    return { id: "demo_w" + rid + "_" + i, name: w.name || "", isDefault: !w.name, products: w.products };
  }) };
}

// Fikcyjni klienci. status: nowe | zrealizowane | odrzucone
var CLIENTS = [
  { name: "Anna i Marcin Wiśniewscy", addr: "ul. Lipowa 14/3", postal: "02-785", city: "Warszawa", phone: "601 234 567", email: "a.wisniewska@example.com", status: "nowe", commission: "", install_fee: "10", offer: "szczegolowa",
    rooms: [room("Salon", [{ name: "Okno narożne", products: [zaslona("Zasłona salon", 420, 260, "Velvet Sand", 189), firana("Firana salon", 420, 260, "Voile Ivory", 79)] }, { name: "Taras", products: [zaslona("Zasłona taras", 240, 260, "Velvet Sand", 189)] }]),
            room("Sypialnia", [{ products: [zaslona("Zasłona sypialnia", 260, 255, "Blackout Graphite", 149), zaluzja("al25", 120, 150)] }])] },
  { name: "Katarzyna Zielińska", addr: "ul. Kasztanowa 7", postal: "50-120", city: "Wrocław", phone: "602 345 678", email: "k.zielinska@example.com", status: "nowe", install_fee: "800", install_fee_mode: "amount", offer: "uproszczona",
    rooms: [room("Salon", [{ products: [zaslona("Zasłony lniane", 380, 250, "Len Natural", 169), firana("Firana", 380, 250, "Voile Ecru", 69)] }]),
            room("Gabinet", [{ products: [zaluzja("al25", 100, 140), zaluzja("al25", 90, 140)] }])] },
  { name: "Piotr Kowalczyk", addr: "ul. Słoneczna 22", postal: "30-001", city: "Kraków", phone: "603 456 789", email: "p.kowalczyk@example.com", status: "zrealizowane", install_fee: "10", offer: "szczegolowa",
    rooms: [room("Salon", [{ products: [zaslona("Zasłona", 500, 270, "Velvet Navy", 199), inny("Karnisz podwójny 5 m", 640, 1)] }]),
            room("Pokój dziecięcy", [{ products: [zaslona("Zasłona", 200, 250, "Blackout Sky", 139), zaluzja("al25", 110, 130)] }])] },
  { name: "Joanna Lewandowska", addr: "al. Róż 3/12", postal: "80-180", city: "Gdańsk", phone: "604 567 890", email: "j.lewandowska@example.com", status: "zrealizowane", install_fee: "10", offer: "szczegolowa",
    rooms: [room("Salon", [{ products: [zaslona("Zasłona", 360, 265, "Velvet Emerald", 209), firana("Firana", 360, 265, "Voile White", 75)] }]),
            room("Sypialnia", [{ products: [zaslona("Zasłona", 300, 255, "Blackout Ash", 149)] }]),
            room("Kuchnia", [{ products: [zaluzja("al25", 80, 120)] }])] },
  { name: "Tomasz Mazur", addr: "ul. Kolejowa 41", postal: "60-701", city: "Poznań", phone: "605 678 901", email: "t.mazur@example.com", status: "odrzucone", install_fee: "", offer: "szczegolowa",
    rooms: [room("Salon", [{ products: [zaslona("Zasłona", 450, 270, "Velvet Wine", 219)] }])] },
  { name: "Magdalena Szymańska", addr: "ul. Parkowa 9/5", postal: "40-050", city: "Katowice", phone: "606 789 012", email: "m.szymanska@example.com", status: "nowe", install_fee: "10", offer: "uproszczona",
    rooms: [room("Salon", [{ products: [zaslona("Zasłona", 400, 260, "Chenille Taupe", 179), firana("Firana", 400, 260, "Voile Ivory", 79)] }]),
            room("Jadalnia", [{ products: [zaslona("Zasłona", 220, 260, "Chenille Taupe", 179)] }])] },
  { name: "Robert i Ewa Dąbrowscy", addr: "ul. Brzozowa 18", postal: "20-400", city: "Lublin", phone: "607 890 123", email: "dabrowscy@example.com", status: "nowe", install_fee: "1200", install_fee_mode: "amount", offer: "szczegolowa",
    rooms: [room("Salon", [{ name: "Okno wykuszowe", products: [zaslona("Zasłona", 520, 270, "Velvet Sand", 189), firana("Firana", 520, 270, "Voile Ivory", 79), inny("Karnisz sufitowy 5,2 m", 780, 1)] }]),
            room("Sypialnia", [{ products: [zaslona("Zasłona", 280, 260, "Blackout Graphite", 149), zaluzja("al25", 130, 150)] }])] },
  { name: "Agnieszka Kamińska", addr: "ul. Morska 55/8", postal: "81-001", city: "Gdynia", phone: "608 901 234", email: "a.kaminska@example.com", status: "zrealizowane", install_fee: "10", offer: "szczegolowa",
    rooms: [room("Salon", [{ products: [zaslona("Zasłona", 340, 255, "Len Stone", 169)] }]),
            room("Gabinet", [{ products: [zaluzja("al25", 140, 160)] }])] },
  { name: "Krzysztof Jankowski", addr: "ul. Polna 2", postal: "90-001", city: "Łódź", phone: "609 012 345", email: "k.jankowski@example.com", status: "nowe", install_fee: "", offer: "uproszczona",
    rooms: [room("Pokój", [{ products: [zaluzja("al25", 120, 140), zaluzja("al25", 100, 140), zaluzja("al25", 80, 140)] }])] },
  { name: "Natalia Wójcik", addr: "ul. Akacjowa 11/2", postal: "35-001", city: "Rzeszów", phone: "510 123 456", email: "n.wojcik@example.com", status: "odrzucone", install_fee: "10", offer: "szczegolowa",
    rooms: [room("Salon", [{ products: [zaslona("Zasłona", 380, 260, "Velvet Navy", 199), firana("Firana", 380, 260, "Voile White", 75)] }])] },
  { name: "Hotel Pod Lipami (kontrahent B2B)", addr: "ul. Rynek 1", postal: "58-500", city: "Jelenia Góra", phone: "511 234 567", email: "recepcja@podlipami.example.com", status: "nowe", install_fee: "10", offer: "szczegolowa",
    rooms: [room("Pokój typu Deluxe (x6)", [{ products: [zaslona("Zasłona blackout", 300, 260, "Blackout Ash", 149), zaluzja("al25", 110, 150)] }]),
            room("Restauracja", [{ products: [zaslona("Zasłona", 600, 300, "Velvet Wine", 219), firana("Firana", 600, 300, "Voile Ivory", 79)] }])] },
  { name: "Ilona Pawlak", addr: "ul. Wiosenna 6", postal: "70-001", city: "Szczecin", phone: "512 345 678", email: "i.pawlak@example.com", status: "zrealizowane", install_fee: "10", offer: "uproszczona",
    rooms: [room("Sypialnia", [{ products: [zaslona("Zasłona", 270, 250, "Blackout Sky", 139), zaluzja("al25", 90, 130)] }])] }
];

var CONTACT_EXTRA = [
  { kind: "firma", role: "dostawca", name: "Tkaniny Demo Sp. z o.o.", nip: "5252344078", street: "ul. Przemysłowa 5", postal: "93-100", city: "Łódź", email: "zamowienia@tkaniny-demo.example.com", phone: "42 123 45 67", notes: "Dostawca tkanin (dane fikcyjne)" },
  { kind: "firma", role: "dostawca", name: "Karnisze i Szyny Demo", nip: "7010001454", street: "ul. Techniczna 12", postal: "05-500", city: "Piaseczno", email: "biuro@karnisze-demo.example.com", phone: "22 765 43 21", notes: "Dostawca karniszy (dane fikcyjne)" }
];

// ── Wyliczenia ───────────────────────────────────────────────────────────────
function prodTotal(p) { return p.mp != null ? p.mp : (calc(p).total || 0); }
function clientNet(cl) {
  return cl.rooms.reduce(function (a, r) { return a + r.windows.reduce(function (b, w) { return b + w.products.reduce(function (c, p) { return c + prodTotal(p); }, 0); }, 0); }, 0);
}
function withInstall(cl, net) {
  var f = parseFloat(String(cl.install_fee || "").replace(",", ".")) || 0;
  if (!f) return net;
  return net + (cl.install_fee_mode === "amount" ? f : net * f / 100);
}
var pad = function (n) { return String(n).padStart(2, "0"); };
function dayOffset(d) { var t = new Date(); t.setDate(t.getDate() - d); return t; }
function ymd(t) { return t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()); }
function iso(t) { return t.toISOString(); }
function slug(s) { return s.split(" ").pop().replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, ""); }

var rows = CLIENTS.map(function (cl, i) {
  var net = clientNet(cl), total = withInstall(cl, net);
  var created = dayOffset(3 + i * 4);
  return { cl: cl, net: net, total: total, created: created };
});

console.log("Wyceny demo:");
rows.forEach(function (r) {
  console.log("  " + r.cl.name.padEnd(36) + r.cl.status.padEnd(14) + r.total.toFixed(2).padStart(10) + " zl");
  if (!(r.net > 0)) { console.error("  ^ BLAD: wycena = 0, sprawdz nazwy tkanin/wymiary"); process.exitCode = 2; }
});
if (DRY || process.exitCode) process.exit();

// ── Zapis do Supabase ────────────────────────────────────────────────────────
var H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
async function api(method, path, body, extra) {
  var res = await fetch(SB_URL + path, { method: method, headers: Object.assign({}, H, { Prefer: "return=representation" }, extra || {}), body: body ? JSON.stringify(body) : undefined });
  var txt = await res.text();
  if (!res.ok) throw new Error(method + " " + path + " -> " + res.status + " " + txt);
  return txt ? JSON.parse(txt) : null;
}

async function main() {
  var users = await api("GET", "/auth/v1/admin/users?per_page=1000");
  var user = (users.users || []).find(function (u) { return u.email === EMAIL; });
  var tenantId;
  if (user) {
    tenantId = user.app_metadata && user.app_metadata.tenant_id;
    if (!tenantId) throw new Error("Uzytkownik " + EMAIL + " istnieje bez tenant_id - nie dotykam.");
    var t = (await api("GET", "/rest/v1/tenants?id=eq." + tenantId + "&select=id,is_demo"))[0];
    if (!t || !t.is_demo) throw new Error("Konto " + EMAIL + " nie jest kontem demo (is_demo=false) - przerywam, zeby nie skasowac prawdziwych danych.");
    if (!RESET) { console.log("Konto demo juz istnieje (" + EMAIL + "). Uzyj --reset, by zaladowac dane od nowa."); return; }
    for (var tbl of ["offers", "clients", "contacts"]) await api("DELETE", "/rest/v1/" + tbl + "?tenant_id=eq." + tenantId);
    console.log("Wyczyszczono stare dane demo.");
  } else {
    var tn = (await api("POST", "/rest/v1/tenants", { name: TENANT_NAME, is_demo: true, trial_ends_at: null, subscription_status: "active",
      config: { brand_name: TENANT_NAME, email: EMAIL, phone: "500 000 000" } }))[0];
    tenantId = tn.id;
    await api("POST", "/auth/v1/admin/users", { email: EMAIL, password: PASSWORD, email_confirm: true,
      app_metadata: { tenant_id: tenantId, is_tenant_admin: true }, user_metadata: { studio_name: TENANT_NAME } });
    console.log("Utworzono tenanta i uzytkownika " + EMAIL);
  }

  var contactRows = rows.map(function (r) {
    return { tenant_id: tenantId, kind: /Hotel/.test(r.cl.name) ? "firma" : "osoba", role: "klient", name: r.cl.name, street: r.cl.addr, postal: r.cl.postal, city: r.cl.city, email: r.cl.email, phone: r.cl.phone };
  }).concat(CONTACT_EXTRA.map(function (c) { return Object.assign({ tenant_id: tenantId }, c); }));
  var contacts = await api("POST", "/rest/v1/contacts", contactRows);

  var clientRows = rows.map(function (r, i) {
    var cl = r.cl;
    return { tenant_id: tenantId, name: cl.name, addr: cl.addr, postal: cl.postal, city: cl.city, phone: cl.phone, email: cl.email,
      rooms: cl.rooms, status: cl.status, install_fee: cl.install_fee || null, install_fee_mode: cl.install_fee_mode || "percent",
      contact_id: contacts[i].id, created_at: iso(r.created) };
  });
  var clients = await api("POST", "/rest/v1/clients", clientRows);

  var offerRows = [];
  clients.forEach(function (c, i) {
    var r = rows[i];
    if (r.cl.status === "odrzucone" && i % 2) return;
    offerRows.push({ tenant_id: tenantId, client_id: c.id, number: "OF-" + ymd(r.created) + "-" + slug(r.cl.name), kind: r.cl.offer,
      total_gross: Math.round(r.total * 100) / 100, valid_until: dayOffset(-14 + i * 4).toISOString().slice(0, 10),
      status: r.cl.status === "zrealizowane" ? "zaakceptowana" : "wygenerowana", created_at: iso(r.created) });
  });
  await api("POST", "/rest/v1/offers", offerRows);

  console.log("Gotowe: " + clients.length + " klientow, " + offerRows.length + " ofert, " + contacts.length + " kontrahentow.");
  console.log("Logowanie: " + EMAIL);
}
main().catch(function (e) { console.error(e.message); process.exit(1); });
