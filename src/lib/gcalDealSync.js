// gcalDealSync.js — terminy z karty deala (pomiar / realizacja / termin 2 / follow-up)
// jako wydarzenia w Google Calendar.
//
// Każde wydarzenie dostaje znacznik extendedProperties.private.pdKey = "<dealId>:<pole>",
// dzięki czemu zmiana daty w dealu aktualizuje istniejące wydarzenie zamiast tworzyć
// kopię, a kalendarz w aplikacji wie, że wpis z CRM ma już swój odpowiednik w Google.

var API = "https://www.googleapis.com/calendar/v3/calendars/";

export var DEAL_DATE_FIELDS = ["visit_date", "delivery_date", "delivery_date2", "followup_date"];

export function dealKey(dealId, field) { return dealId + ":" + field; }

export function parseDealKey(key) {
  var i = String(key || "").lastIndexOf(":");
  if (i < 0) return null;
  return { dealId: key.slice(0, i), field: key.slice(i + 1) };
}

export function eventDealKey(ev) {
  var pr = ev && ev.extendedProperties && ev.extendedProperties.private;
  return (pr && pr.pdKey) || null;
}

export function dealFieldTitle(field, deal) {
  if (field === "visit_date") return "Pomiar";
  if (field === "delivery_date") return "Montaż";
  if (field === "delivery_date2") return (deal && deal.install_label2) || "Wieszanie";
  return "Follow-up";
}

var DURATION_FIELD = { visit_date: "visit_duration_min", delivery_date: "delivery_duration_min", delivery_date2: "delivery2_duration_min", followup_date: "followup_duration_min" };

// Czas trwania zapisany w dealu (z godziny „DO” w oknie Google), a bez niego domyślny
function defaultDurMin(field, deal) {
  var saved = deal && Number(deal[DURATION_FIELD[field]]);
  if (saved > 0) return saved;
  if (field === "visit_date") return 60;
  if (field === "followup_date") return 30;
  return 180;
}

// Termin bez godziny (północ) → domyślnie 9:00, tak jak w oknie „Dodaj do kalendarza"
export function dealStartDate(val) {
  if (!val) return null;
  var d = new Date(val);
  if (isNaN(d.getTime())) return null;
  if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(9, 0, 0, 0);
  return d;
}

// ctx = { token, getFresh } — po 401 pobieramy świeży token i zapamiętujemy go w ctx
function req(ctx, url, opts) {
  opts = opts || {};
  function go(t) {
    var h = Object.assign({ Authorization: "Bearer " + t }, opts.headers || {});
    return fetch(url, Object.assign({}, opts, { headers: h }));
  }
  return go(ctx.token).then(function (r) {
    if (r.status === 401 && ctx.getFresh) {
      return ctx.getFresh().then(function (fresh) { ctx.token = fresh; return go(fresh); });
    }
    return r;
  });
}

function json(r) {
  if (!r.ok) return r.text().then(function (t) { throw new Error("GCal " + r.status + ": " + t); });
  return r.json();
}

function tzTime(d) { return { dateTime: d.toISOString(), timeZone: "Europe/Warsaw" }; }

// Tworzy wydarzenie albo aktualizuje już istniejące (po znaczniku pdKey).
// o: { calId, key, summary, description, location, start:Date, durMin, clientName }
export function upsertDealEvent(ctx, o) {
  var base = API + encodeURIComponent(o.calId) + "/events";

  function patch(id, body) {
    return req(ctx, base + "/" + encodeURIComponent(id), {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(json);
  }

  function findByKey() {
    return req(ctx, base + "?privateExtendedProperty=" + encodeURIComponent("pdKey=" + o.key) + "&maxResults=5")
      .then(json).then(function (d) { return (d.items || [])[0] || null; });
  }

  // Wydarzenia dodane wcześniej oknem „Dodaj do kalendarza" nie mają znacznika —
  // dopasowujemy po godzinie startu i nazwie klienta i "adoptujemy" je zamiast dublować.
  function findLegacy() {
    var url = base + "?singleEvents=true&timeMin=" + encodeURIComponent(o.start.toISOString())
      + "&timeMax=" + encodeURIComponent(new Date(o.start.getTime() + 60000).toISOString())
      + (o.clientName ? "&q=" + encodeURIComponent(o.clientName) : "");
    return req(ctx, url).then(json).then(function (d) {
      return (d.items || []).find(function (e) {
        var s = e.start && e.start.dateTime;
        return s && Math.abs(new Date(s) - o.start) < 60000 && !eventDealKey(e);
      }) || null;
    });
  }

  return findByKey().then(function (ev) {
    if (ev) {
      var cur = ev.start && ev.start.dateTime;
      if (cur && Math.abs(new Date(cur) - o.start) < 60000) return ev;
      var len = (cur && ev.end && ev.end.dateTime) ? (new Date(ev.end.dateTime) - new Date(cur)) : o.durMin * 60000;
      return patch(ev.id, { start: tzTime(o.start), end: tzTime(new Date(o.start.getTime() + len)) });
    }
    return findLegacy().then(function (legacy) {
      if (legacy) return patch(legacy.id, { extendedProperties: { "private": { pdKey: o.key } } });
      return req(ctx, base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: o.summary,
          description: o.description || "",
          location: o.location || undefined,
          start: tzTime(o.start),
          end: tzTime(new Date(o.start.getTime() + o.durMin * 60000)),
          extendedProperties: { "private": { pdKey: o.key } }
        })
      }).then(json);
    });
  });
}

// Kalendarz montażysty: z jawnie zapisanego id, a gdy go brak (UI go nie ustawia) —
// po nazwie montażysty zawartej w nazwie kalendarza, tak jak w oknie „Dodaj do kalendarza".
export function installerCalendarId(deal, field, calList) {
  var second = field === "delivery_date2";
  if (field !== "delivery_date" && !second) return null;
  var id = second ? deal.installer_calendar_id2 : deal.installer_calendar_id;
  if (id && calList.some(function (c) { return c.id === id; })) return id;
  var name = String((second ? deal.installer_name2 : deal.installer_name) || "").trim().toLowerCase();
  if (!name) return null;
  var named = calList.filter(function (c) { return c.summary && c.summary.toLowerCase().indexOf(name) >= 0; });
  var exact = named.find(function (c) { return c.summary.trim().toLowerCase() === name; });
  var m = exact || named[0];
  return m ? m.id : null;
}

// Nazwa wybranego montażysty dla danego terminu (null gdy to nie termin montażowy lub nie wybrano)
export function installerNameFor(deal, field) {
  if (field !== "delivery_date" && field !== "delivery_date2") return null;
  var n = String((field === "delivery_date2" ? deal.installer_name2 : deal.installer_name) || "").trim();
  return n || null;
}

// Wysyła jeden termin deala do kalendarza głównego oraz (gdy ustawiony) kalendarza montażysty.
export function syncDealDateToGcal(ctx, deal, client, field, calList) {
  var start = dealStartDate(deal[field]);
  if (!start) return Promise.resolve({ missingInstaller: null });
  var primary = (calList.find(function (c) { return c.primary; }) || calList[0] || {}).id || "primary";
  var instId = installerCalendarId(deal, field, calList);
  var targets = [primary];
  if (instId && instId !== primary) targets.push(instId);
  // Wybrano montażystę, ale nie ma jego kalendarza na liście — wołający musi o tym ostrzec
  var instName = installerNameFor(deal, field);
  var missingInstaller = instName && !instId ? instName : null;

  var addr = client ? [client.addr, [client.postal, client.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  var parts = [];
  if (client && client.name) parts.push("Klient: " + client.name);
  if (addr) parts.push("Adres: " + addr);
  if (client && client.phone) parts.push("Tel: " + client.phone);
  if (deal.title) parts.push("Deal: " + deal.title);
  var title = dealFieldTitle(field, deal);

  var base = {
    key: dealKey(deal.id, field),
    summary: title + (client && client.name ? " — " + client.name : ""),
    description: parts.join("\n"),
    location: addr,
    start: start,
    durMin: defaultDurMin(field, deal),
    clientName: client && client.name
  };
  return Promise.all(targets.map(function (calId) {
    return upsertDealEvent(ctx, Object.assign({}, base, { calId: calId }));
  })).then(function () { return { missingInstaller: missingInstaller }; });
}
