// demoMock.js — dane przykladowe poczty (Microsoft Graph) i kalendarza (Google) dla kont demo.
// Aktywne tylko gdy tenant ma is_demo=true (zob. supabase.js). Nie laczy sie z zadnym prawdziwym
// kontem: window.fetch przechwytuje wywolania do graph.microsoft.com i googleapis.com/calendar
// i odpowiada gotowym JSON-em w tym samym ksztalcie, co prawdziwe API. Zapisy (wysylka maila,
// dodanie/edycja/usuniecie wydarzenia) dzialaja w pamieci do odswiezenia strony.

export var DEMO_TOKEN = "demo-token";
export var DEMO_MAIL_ACCOUNT = { username: "demo@mydecolab.pl", email: "demo@mydecolab.pl", name: "Studio Dekoracji Demo" };

var installed = false;
var DAY = 86400000;

function isoAt(dayOffset, h, m) {
  var d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
}
function addr(name, email) { return { emailAddress: { name: name, address: email } }; }
var ME = addr("Studio Dekoracji Demo", "demo@mydecolab.pl");

function html(paras, sign) {
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">' +
    paras.map(function (p) { return "<p>" + p + "</p>"; }).join("") +
    (sign ? "<p>" + sign + "</p>" : "") + "</div>";
}

// [id, folder, osoba, e-mail, temat, dzien, godz, tresc (akapity), nieprzeczytane, zalacznik, wazne, kategorie, conversationId]
var MAILS = [
  ["m1", "inbox", "Anna Wiśniewska", "a.wisniewska@example.com", "Wycena zasłon do salonu – kilka pytań", -0, 8, ["Dzień dobry,", "dziękuję za wycenę. Czy zasłony w salonie można uszyć na fali (wave) zamiast na taśmie marszczącej? Czy zmieni to cenę?", "Czy termin montażu w listopadzie jest jeszcze aktualny?"], "Pozdrawiam, Anna Wiśniewska", true, false, true, [], "c1"],
  ["m2", "inbox", "Robert Dąbrowski", "dabrowscy@example.com", "Akceptacja oferty OF-Dąbrowscy", -0, 7, ["Dzień dobry,", "akceptujemy ofertę na salon i sypialnię. Prosimy o fakturę zaliczkową oraz propozycję terminu pomiaru końcowego."], "Robert Dąbrowski", true, true, true, ["Do zrobienia"], "c2"],
  ["m3", "inbox", "Hotel Pod Lipami", "recepcja@podlipami.example.com", "Zapytanie: 24 pokoje + restauracja", -1, 15, ["Szanowni Państwo,", "planujemy odnowienie 24 pokoi typu Deluxe oraz sali restauracyjnej. Prosimy o wstępną wycenę zasłon blackout i firan oraz informację o czasie realizacji.", "W załączeniu rzut pomieszczeń."], "Z poważaniem,<br>Dział zakupów, Hotel Pod Lipami", true, true, false, [], "c3"],
  ["m4", "inbox", "Katarzyna Zielińska", "k.zielinska@example.com", "Re: Oferta uproszczona", -1, 11, ["Dzień dobry,", "ofertę przeczytałam, bardzo mi się podoba len w kolorze natural. Czy mogę dostać próbkę tkaniny do domu?"], "Kasia", false, false, false, [], "c4"],
  ["m5", "inbox", "Piotr Kowalczyk", "p.kowalczyk@example.com", "Dziękuję – wszystko wisi pięknie!", -2, 17, ["Dzień dobry,", "chciałbym podziękować za profesjonalny montaż. Zasłony wyglądają świetnie. Polecimy Państwa znajomym."], "Piotr", false, false, false, [], "c5"],
  ["m6", "inbox", "Tkaniny Demo Sp. z o.o.", "zamowienia@tkaniny-demo.example.com", "Potwierdzenie zamówienia ZK/2026/1042", -3, 9, ["Potwierdzamy przyjęcie zamówienia na 38 mb tkaniny Velvet Sand. Planowana wysyłka: 3 dni robocze."], "Dział sprzedaży, Tkaniny Demo", false, true, false, ["Dostawcy"], "c6"],
  ["m7", "inbox", "Magdalena Szymańska", "m.szymanska@example.com", "Zmiana terminu pomiaru", -4, 13, ["Dzień dobry,", "czy możemy przesunąć pomiar z wtorku na czwartek po 15:00? Przepraszam za kłopot."], "Magda", true, false, false, [], "c7"],
  ["m8", "inbox", "Krzysztof Jankowski", "k.jankowski@example.com", "Żaluzje – jaki kolor wybrać?", -6, 10, ["Dzień dobry, mam dylemat między bielą a szarym aluminium. Co Państwo polecają do pokoju od strony południowej?"], "Krzysztof", false, false, false, [], "c8"],
  ["s1", "sent", "Anna Wiśniewska", "a.wisniewska@example.com", "Wycena zasłon do salonu", -5, 14, ["Dzień dobry,", "w załączeniu przesyłam wycenę zasłon i firan do salonu oraz sypialni. Oferta ważna 14 dni.", "W razie pytań jestem do dyspozycji."], "Pozdrawiam,<br>Studio Dekoracji Demo", false, true, false, [], "c1"],
  ["s2", "sent", "Robert Dąbrowski", "dabrowscy@example.com", "Oferta – salon z wykuszem i sypialnia", -9, 12, ["Dzień dobry,", "przesyłam ofertę wraz z wizualizacją zasłon. Proszę o informację, czy wszystko się zgadza."], "Pozdrawiam,<br>Studio Dekoracji Demo", false, true, false, [], "c2"],
  ["s3", "sent", "Katarzyna Zielińska", "k.zielinska@example.com", "Oferta uproszczona – len natural", -3, 16, ["Dzień dobry,", "dziękuję za rozmowę. W załączeniu uproszczona oferta na zasłony lniane i żaluzje do gabinetu."], "Pozdrawiam,<br>Studio Dekoracji Demo", false, true, false, [], "c4"],
  ["x1", "spam", "Promocje Hurtownia", "promo@spam.example.com", "WYPRZEDAŻ!!! Tylko dziś -90%", -2, 3, ["Kliknij tutaj, aby odebrać nagrodę."], "", false, false, false, [], "c9"],
  ["t1", "trash", "Newsletter", "news@example.com", "Nowości w branży dekoracji okien", -7, 8, ["Najnowsze trendy w tkaninach na sezon jesień–zima."], "", false, false, false, [], "c10"]
];

var FOLDER_MAP = { inbox: "inbox", sentitems: "sent", deleteditems: "trash", junkemail: "spam" };
var mailState = null; // { list: [...] }  — gotowe obiekty w ksztalcie Graph

function buildMails() {
  return MAILS.map(function (a) {
    var folder = a[1], sent = folder === "sent";
    var when = isoAt(a[5], a[6], 10 + (a[0].length * 7) % 40);
    var o = {
      id: a[0], _folder: folder, subject: a[4], bodyPreview: a[7].join(" ").slice(0, 140),
      hasAttachments: !!a[10], importance: a[11] ? "high" : "normal", categories: a[12], conversationId: a[13],
      isRead: !a[9],
      toRecipients: sent ? [addr(a[2], a[3])] : [ME], ccRecipients: [],
      body: { contentType: "html", content: html(a[7], a[8]) }
    };
    if (sent) o.sentDateTime = when; else { o.receivedDateTime = when; o.from = addr(a[2], a[3]); }
    return o;
  });
}

// ── Kalendarz Google ─────────────────────────────────────────────────────────
var CALS = [
  { id: "primary", summary: "Studio Dekoracji Demo", backgroundColor: "#4285f4", primary: true, accessRole: "owner" },
  { id: "montaz_marek@demo", summary: "Montaż – Marek", backgroundColor: "#10b981", accessRole: "writer" }
];
var calEvents = null;
var evSeq = 0;

function ev(cal, summary, day, h1, m1, h2, m2, location, description) {
  evSeq++;
  return { id: "demo_ev_" + evSeq, _cal: cal, summary: summary, location: location || "", description: description || "",
    start: { dateTime: isoAt(day, h1, m1) }, end: { dateTime: isoAt(day, h2, m2) }, status: "confirmed" };
}
function buildEvents() {
  evSeq = 0;
  var out = [];
  var P = "primary", M = "montaz_marek@demo";
  out.push(ev(P, "📏 Pomiar — Anna i Marcin Wiśniewscy", 1, 10, 0, 11, 30, "ul. Lipowa 14/3, 02-785 Warszawa", "Tel: 601 234 567"));
  out.push(ev(P, "📏 Pomiar — Katarzyna Zielińska", 2, 14, 0, 15, 0, "ul. Kasztanowa 7, 50-120 Wrocław", "Tel: 602 345 678"));
  out.push(ev(M, "🔧 Montaż — Robert i Ewa Dąbrowscy", 3, 9, 0, 14, 0, "ul. Brzozowa 18, 20-400 Lublin", "Salon z wykuszem + sypialnia"));
  out.push(ev(P, "⏰ Follow-up — Magdalena Szymańska", 3, 12, 0, 12, 30, "", "Zadzwonić w sprawie oferty uproszczonej"));
  out.push(ev(P, "🧵 Odbiór tkaniny — Tkaniny Demo", 5, 9, 30, 10, 0, "ul. Przemysłowa 5, Łódź", ""));
  out.push(ev(M, "🔧 Montaż — Agnieszka Kamińska", 6, 10, 0, 13, 0, "ul. Morska 55/8, 81-001 Gdynia", ""));
  out.push(ev(P, "🤝 Spotkanie — Hotel Pod Lipami (wycena B2B)", 8, 11, 0, 12, 30, "ul. Rynek 1, Jelenia Góra", "Wstępne ustalenia: 24 pokoje + restauracja"));
  out.push(ev(P, "📏 Pomiar — Krzysztof Jankowski", 9, 16, 0, 17, 0, "ul. Polna 2, 90-001 Łódź", ""));
  out.push(ev(M, "🔧 Montaż — Ilona Pawlak", 12, 9, 0, 12, 0, "ul. Wiosenna 6, Szczecin", ""));
  out.push(ev(P, "📞 Follow-up — Anna Wiśniewska", 14, 15, 0, 15, 30, "", ""));
  out.push(ev(P, "Przegląd kolekcji tkanin — targi", 20, 10, 0, 16, 0, "Warszawa, EXPO XXI", ""));
  out.push(ev(P, "✅ Realizacja — Joanna Lewandowska", -2, 9, 0, 13, 0, "al. Róż 3/12, 80-180 Gdańsk", ""));
  out.push(ev(P, "📏 Pomiar — Piotr Kowalczyk", -9, 11, 0, 12, 0, "ul. Słoneczna 22, 30-001 Kraków", ""));
  out.push(ev(M, "🔧 Montaż — Piotr Kowalczyk", -4, 9, 0, 14, 0, "ul. Słoneczna 22, 30-001 Kraków", ""));
  out.push(ev(P, "📏 Pomiar — Tomasz Mazur", -12, 17, 0, 18, 0, "ul. Kolejowa 41, 60-701 Poznań", ""));
  out.push(ev(P, "Spotkanie zespołu", -1, 8, 30, 9, 0, "", ""));
  out.push(ev(P, "Spotkanie zespołu", 6, 8, 30, 9, 0, "", ""));
  out.push(ev(P, "Spotkanie zespołu", -8, 8, 30, 9, 0, "", ""));
  out.push(ev(P, "Szkolenie – nowe kolekcje", 24, 13, 0, 15, 0, "", ""));
  out.push(ev(P, "📏 Pomiar — Natalia Wójcik", -16, 15, 0, 16, 0, "ul. Akacjowa 11/2, 35-001 Rzeszów", ""));
  return out;
}

// ── Pomocnicze odpowiedzi ────────────────────────────────────────────────────
function jsonRes(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } });
}
function emptyRes(status) { return new Response(null, { status: status || 204 }); }
function readBody(init) {
  try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; }
}
function parseUrl(u) { try { return new URL(u, "https://x.invalid"); } catch (e) { return null; } }

function graphMessage(m) {
  var o = Object.assign({}, m);
  delete o._folder; delete o.body;
  return o;
}

function handleGraph(url, method, init) {
  var u = parseUrl(url); if (!u) return null;
  var path = decodeURIComponent(u.pathname).replace(/^\/v1\.0\/me\/?/, "");
  if (!mailState) mailState = buildMails();

  var mf = /^mailFolders\/([^/]+)\/messages$/.exec(path);
  if (mf && method === "GET") {
    var folder = FOLDER_MAP[mf[1].toLowerCase()] || "inbox";
    var list = mailState.filter(function (m) { return m._folder === folder; });
    var q = u.searchParams.get("$search");
    if (q) { q = q.replace(/"/g, "").toLowerCase(); list = list.filter(function (m) { return (m.subject + " " + m.bodyPreview + " " + (m.from ? m.from.emailAddress.name + m.from.emailAddress.address : "")).toLowerCase().indexOf(q) >= 0; }); }
    var dk = folder === "sent" ? "sentDateTime" : "receivedDateTime";
    list = list.slice().sort(function (a, b) { return new Date(b[dk]) - new Date(a[dk]); });
    return jsonRes({ value: list.map(graphMessage) });
  }
  var mm = /^messages\/([^/]+)(\/(move|attachments|send|reply|forward|replyAll)(\/.*)?)?$/.exec(path);
  if (mm) {
    var id = mm[1], sub = mm[3];
    var msg = mailState.find(function (m) { return m.id === id; });
    if (!sub && method === "GET") return msg ? jsonRes({ id: msg.id, body: msg.body }) : jsonRes({ error: { code: "ErrorItemNotFound" } }, 404);
    if (sub === "attachments") return jsonRes({ value: [] });
    if (sub === "move" && method === "POST" && msg) {
      var dest = String(readBody(init).destinationId || "").toLowerCase();
      msg._folder = FOLDER_MAP[dest] || msg._folder;
      return jsonRes(graphMessage(msg));
    }
    if (!sub && method === "PATCH" && msg) { Object.assign(msg, readBody(init)); return jsonRes(graphMessage(msg)); }
    if (!sub && method === "DELETE") { if (msg) msg._folder = "trash"; return emptyRes(204); }
    return emptyRes(202);
  }
  if (path === "sendMail" && method === "POST") {
    var b = (readBody(init).message) || {};
    mailState.push({
      id: "sent_" + Date.now(), _folder: "sent", subject: b.subject || "(bez tematu)",
      bodyPreview: String((b.body && b.body.content) || "").replace(/<[^>]+>/g, " ").slice(0, 140),
      hasAttachments: !!(b.attachments && b.attachments.length), importance: "normal", categories: [],
      conversationId: "c_" + Date.now(), isRead: true, sentDateTime: new Date().toISOString(),
      toRecipients: b.toRecipients || [], ccRecipients: b.ccRecipients || [], body: b.body || { contentType: "text", content: "" }
    });
    return emptyRes(202);
  }
  if (path === "outlook/masterCategories") return jsonRes({ value: [{ id: "1", displayName: "Do zrobienia", color: "preset0" }, { id: "2", displayName: "Dostawcy", color: "preset4" }] });
  if (path === "events") return jsonRes({ id: "demo_ms_ev_" + Date.now() }, 201);
  if (path === "" || path === "me") return jsonRes(DEMO_MAIL_ACCOUNT);
  return jsonRes({ value: [] });
}

function handleCalendar(url, method, init) {
  var u = parseUrl(url); if (!u) return null;
  var path = u.pathname.replace(/^\/calendar\/v3\//, "");
  if (!calEvents) calEvents = buildEvents();

  if (path.indexOf("users/me/calendarList") === 0) return jsonRes({ items: CALS });
  var m = /^calendars\/([^/]+)\/events(\/([^/]+))?$/.exec(path);
  if (!m) return jsonRes({ items: [] });
  var calId = decodeURIComponent(m[1]), evId = m[3] ? decodeURIComponent(m[3]) : null;

  if (!evId && method === "GET") {
    var from = new Date(u.searchParams.get("timeMin") || 0).getTime();
    var to = new Date(u.searchParams.get("timeMax") || "2100-01-01").getTime();
    var items = calEvents.filter(function (e) {
      var cid = calId === "primary" ? "primary" : calId;
      if (e._cal !== cid) return false;
      var s = new Date(e.start.dateTime || e.start.date).getTime();
      return s >= from && s <= to;
    }).map(function (e) { var c = Object.assign({}, e); delete c._cal; return c; });
    return jsonRes({ items: items });
  }
  if (!evId && method === "POST") {
    var body = readBody(init);
    var created = Object.assign({ id: "demo_ev_new_" + Date.now(), _cal: calId, status: "confirmed" }, body);
    calEvents.push(created);
    var out = Object.assign({}, created); delete out._cal;
    return jsonRes(out);
  }
  if (evId && method === "PATCH") {
    var tgt = calEvents.find(function (e) { return e.id === evId; });
    if (tgt) Object.assign(tgt, readBody(init));
    return jsonRes(tgt ? Object.assign({}, tgt) : {});
  }
  if (evId && method === "DELETE") {
    calEvents = calEvents.filter(function (e) { return e.id !== evId; });
    return emptyRes(204);
  }
  return jsonRes({});
}

// Wlacza przechwytywanie fetch. Idempotentne; wolane po wykryciu is_demo.
export function installDemoMock() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var res = null;
    try {
      if (url.indexOf("https://graph.microsoft.com/") === 0) res = handleGraph(url, method, init);
      else if (url.indexOf("https://www.googleapis.com/calendar/v3/") === 0) res = handleCalendar(url, method, init);
    } catch (e) { console.error("[demo] mock error", e); }
    return res ? Promise.resolve(res) : realFetch(input, init);
  };
}

export function isDemoMode() {
  return typeof window !== "undefined" && !!window.PD_IS_DEMO;
}
