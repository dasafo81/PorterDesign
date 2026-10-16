// gmailApi.js — adapter Gmail API udający fragment Microsoft Graph.
//
// Moduł Mail (ScreenMail, CRM, Faktury) mówi w dialekcie Graph: te same URL-e,
// te same kształty odpowiedzi. Zamiast przepisywać ~3400 linii UI, gmailFetch()
// przyjmuje wywołanie "jak do Graph" i wykonuje je na Gmail API, zwracając
// Response w kształcie Graph. Obsługiwane trasy (to, czego używa aplikacja):
//   GET    /me/mailFolders/{inbox|sentItems|deletedItems|junkEmail}/messages
//   GET    /me/messages/{id}?$select=body
//   GET    /me/messages/{id}/attachments[/{partId}]
//   POST   /me/sendMail            POST /me/messages/{id}/move
//   PATCH  /me/messages/{id}       DELETE /me/messages/{id}
//   POST   /me/outlook/masterCategories    POST /me/events (Google Calendar)
//
// Mapowanie pojęć:  folder → etykieta systemowa, kategoria Outlooka → etykieta
// użytkownika, importance=high → gwiazdka, conversationId → threadId.
// Zakres OAuth: gmail.modify (bez trwałego usuwania — kosz opróżnia Gmail po 30 dniach).

var GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
var GMAIL_UPLOAD = "https://gmail.googleapis.com/upload/gmail/v1/users/me";
var GCAL_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

var FOLDER_LABEL = { inbox: "INBOX", sentItems: "SENT", deletedItems: "TRASH", junkEmail: "SPAM" };
// Każda wiadomość to osobne żądanie metadanych, więc limitujemy rozmiar pierwszej strony.
var FOLDER_PAGE_CAP = { inbox: 50, sentItems: 30, deletedItems: 15, junkEmail: 15 };
var META_CONCURRENCY = 8;

function jsonRes(data, status) {
  if (status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(data == null ? {} : data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function errRes(message, status) {
  return jsonRes({ error: { message: message, code: "Gmail" + (status || 500) } }, status || 500);
}

function bearer(init) {
  var h = (init && init.headers) || {};
  return h.Authorization || h.authorization || "";
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// Zapytanie do Gmail API z ponowieniem przy 429/5xx (limit zapytań na użytkownika).
async function gfetch(url, auth, init, attempt) {
  attempt = attempt || 0;
  var opts = Object.assign({}, init || {});
  opts.headers = Object.assign({ Authorization: auth }, opts.headers || {});
  var r = await fetch(url, opts);
  if ((r.status === 429 || r.status >= 500) && attempt < 3) {
    var retryAfter = parseInt(r.headers.get("Retry-After") || "0", 10) * 1000;
    await sleep(Math.max(retryAfter, 400 * Math.pow(2, attempt)));
    return gfetch(url, auth, init, attempt + 1);
  }
  return r;
}

async function gjson(path, auth, init) {
  var r = await gfetch(GMAIL + path, auth, init);
  if (!r.ok) {
    var body = null;
    try { body = await r.json(); } catch (e) {}
    var err = new Error((body && body.error && body.error.message) || ("Gmail HTTP " + r.status));
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? {} : r.json();
}

// ── Kodowanie ────────────────────────────────────────────────────────────────
function b64urlToBytes(s) {
  var b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToUtf8(s) {
  try { return new TextDecoder("utf-8").decode(b64urlToBytes(s)); } catch (e) { return ""; }
}

function b64urlToB64(s) {
  var b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return b64;
}

function bytesToB64(bytes) {
  var bin = "";
  for (var i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function utf8ToB64(str) { return bytesToB64(new TextEncoder().encode(str)); }

function wrap76(b64) { return String(b64).replace(/\s+/g, "").replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, ""); }

function decodeEntities(s) {
  if (!s || s.indexOf("&") < 0) return s || "";
  var el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

// RFC 2047: =?UTF-8?B?...?= / =?UTF-8?Q?...?=
function decodeMimeWords(s) {
  return String(s || "").replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=(\s+(?==\?))?/g, function(m, cs, enc, txt) {
    try {
      var bytes;
      if (enc.toLowerCase() === "b") {
        bytes = b64urlToBytes(txt);
      } else {
        var q = txt.replace(/_/g, " ");
        var arr = [];
        for (var i = 0; i < q.length; i++) {
          if (q[i] === "=" && /^[0-9a-fA-F]{2}$/.test(q.substr(i + 1, 2))) { arr.push(parseInt(q.substr(i + 1, 2), 16)); i += 2; }
          else arr.push(q.charCodeAt(i));
        }
        bytes = new Uint8Array(arr);
      }
      return new TextDecoder(cs).decode(bytes);
    } catch (e) { return m; }
  });
}

function encodeHeaderWord(text) {
  var s = String(text == null ? "" : text).replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  // Encoded-word ma limit 75 znaków — tniemy po znakach, nie po bajtach, żeby nie rozbić UTF-8.
  var chunks = [], cur = "";
  Array.from(s).forEach(function(ch) {
    if (new TextEncoder().encode(cur + ch).length > 42) { chunks.push(cur); cur = ch; } else cur += ch;
  });
  if (cur) chunks.push(cur);
  return chunks.map(function(c) { return "=?UTF-8?B?" + utf8ToB64(c) + "?="; }).join("\r\n ");
}

// ── Adresy ───────────────────────────────────────────────────────────────────
function splitAddressList(s) {
  var out = [], cur = "", q = false, angle = false;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c === '"') q = !q;
    else if (!q && c === "<") angle = true;
    else if (!q && c === ">") angle = false;
    if (c === "," && !q && !angle) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseAddress(raw) {
  var s = decodeMimeWords(String(raw || "").trim());
  var m = s.match(/^(.*?)<([^>]+)>\s*$/);
  var name = "", address = s;
  if (m) { name = m[1].trim().replace(/^"|"$/g, "").replace(/\\"/g, '"'); address = m[2].trim(); }
  return { emailAddress: { name: name || address, address: address } };
}

function parseAddressList(h) {
  if (!h) return [];
  return splitAddressList(h).map(parseAddress).filter(function(a) { return a.emailAddress.address; });
}

// ── Etykiety (kategorie) ─────────────────────────────────────────────────────
var _labels = null;      // { byId:{id:{name,type}}, byName:{name:id} }
var _labelsAuth = "";

async function loadLabels(auth, force) {
  if (_labels && !force && _labelsAuth === auth) return _labels;
  var data = await gjson("/labels", auth);
  var byId = {}, byName = {};
  (data.labels || []).forEach(function(l) {
    byId[l.id] = { name: l.name, type: l.type };
    byName[l.name] = l.id;
  });
  _labels = { byId: byId, byName: byName };
  _labelsAuth = auth;
  return _labels;
}

async function ensureLabel(auth, name) {
  var labels = await loadLabels(auth);
  if (labels.byName[name]) return labels.byName[name];
  try {
    var created = await gjson("/labels", auth, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, labelListVisibility: "labelShow", messageListVisibility: "show" })
    });
    labels.byName[name] = created.id;
    labels.byId[created.id] = { name: created.name, type: "user" };
    return created.id;
  } catch (e) {
    if (e.status === 409) { // już istnieje (inna karta/urządzenie) — odśwież cache
      var fresh = await loadLabels(auth, true);
      if (fresh.byName[name]) return fresh.byName[name];
    }
    throw e;
  }
}

function userCategories(labelIds, labels) {
  var out = [];
  (labelIds || []).forEach(function(id) {
    var l = labels && labels.byId[id];
    if (l && l.type === "user") out.push(l.name);
  });
  return out;
}

// ── Mapowanie wiadomości → kształt Graph ─────────────────────────────────────
function headerMap(payload) {
  var h = {};
  ((payload && payload.headers) || []).forEach(function(x) { h[x.name.toLowerCase()] = x.value; });
  return h;
}

function toGraphMessage(m, labels) {
  var h = headerMap(m.payload);
  var iso = new Date(parseInt(m.internalDate, 10) || Date.now()).toISOString();
  var ids = m.labelIds || [];
  return {
    id: m.id,
    conversationId: m.threadId,
    subject: decodeMimeWords(h.subject || ""),
    bodyPreview: decodeEntities(m.snippet || ""),
    receivedDateTime: iso,
    sentDateTime: iso,
    from: h.from ? parseAddress(h.from) : null,
    toRecipients: parseAddressList(h.to),
    ccRecipients: parseAddressList(h.cc),
    // format=metadata nie zwraca części MIME; multipart/mixed to niemal zawsze załącznik.
    hasAttachments: /multipart\/(mixed|report)/i.test(h["content-type"] || ""),
    categories: userCategories(ids, labels),
    isRead: ids.indexOf("UNREAD") < 0,
    importance: ids.indexOf("STARRED") >= 0 ? "high" : "normal"
  };
}

async function mapPool(items, limit, fn) {
  var results = new Array(items.length), next = 0;
  async function worker() {
    while (next < items.length) {
      var i = next++;
      try { results[i] = await fn(items[i]); } catch (e) { results[i] = null; }
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

var META_FIELDS = "id,threadId,labelIds,snippet,internalDate,payload/headers";
var META_HEADERS = ["Subject", "From", "To", "Cc", "Date", "Content-Type"]
  .map(function(n) { return "metadataHeaders=" + n; }).join("&");

async function listFolder(auth, folderKey, sp, selfUrl) {
  var label = FOLDER_LABEL[folderKey];
  if (!label) return errRes("Nieznany folder: " + folderKey, 404);
  var top = Math.min(parseInt(sp.get("$top") || "50", 10) || 50, FOLDER_PAGE_CAP[folderKey]);
  var search = sp.get("$search");
  var q = search ? search.replace(/^"|"$/g, "") : "";
  var page = sp.get("$gmailPage") || "";

  var qs = "labelIds=" + label + "&maxResults=" + top
    + (page ? "&pageToken=" + encodeURIComponent(page) : "")
    + (q ? "&q=" + encodeURIComponent(q) : "")
    + (label === "TRASH" || label === "SPAM" ? "&includeSpamTrash=true" : "");
  var list = await gjson("/messages?" + qs, auth);
  var labels = await loadLabels(auth);
  var ids = (list.messages || []).map(function(x) { return x.id; });
  var msgs = await mapPool(ids, META_CONCURRENCY, function(id) {
    return gjson("/messages/" + id + "?format=metadata&" + META_HEADERS + "&fields=" + encodeURIComponent(META_FIELDS), auth);
  });
  var value = msgs.filter(Boolean).map(function(m) { return toGraphMessage(m, labels); });
  var out = { value: value };
  if (list.nextPageToken) {
    // Pseudo-nextLink: wywołujący traktuje go jak URL Graph i znów woła mailFetch().
    var u = new URL(selfUrl);
    u.searchParams.set("$gmailPage", list.nextPageToken);
    out["@odata.nextLink"] = u.toString();
  }
  return jsonRes(out);
}

// ── Treść i załączniki ───────────────────────────────────────────────────────
function collectParts(payload) {
  var html = [], text = [], atts = [];
  (function walk(p) {
    if (!p) return;
    var mt = String(p.mimeType || "").toLowerCase();
    var body = p.body || {};
    var isAtt = !!(body.attachmentId || (p.filename && body.data));
    if (p.filename && isAtt) atts.push(p);
    else if (mt === "text/html" && body.data) html.push(b64urlToUtf8(body.data));
    else if (mt === "text/plain" && body.data) text.push(b64urlToUtf8(body.data));
    else if (isAtt && mt.indexOf("image/") === 0) atts.push(p); // inline bez nazwy pliku
    (p.parts || []).forEach(walk);
  })(payload);
  return { html: html.join(""), text: text.join("\n"), atts: atts };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function getBody(auth, id) {
  var m = await gjson("/messages/" + id + "?format=full", auth);
  var parts = collectParts(m.payload);
  if (parts.html) return jsonRes({ id: id, body: { contentType: "html", content: parts.html } });
  var plain = parts.text || "";
  return jsonRes({ id: id, body: { contentType: "text", content: plain } });
}

function partHeader(part, name) {
  var hs = part.headers || [];
  for (var i = 0; i < hs.length; i++) if (hs[i].name.toLowerCase() === name) return hs[i].value;
  return "";
}

var THUMB_LIMIT = 3 * 1024 * 1024; // jak w Graph: contentBytes tylko dla plików < 3 MB

async function fetchPartBytes(auth, msgId, part) {
  var body = part.body || {};
  if (body.data) return b64urlToB64(body.data);
  var a = await gjson("/messages/" + msgId + "/attachments/" + body.attachmentId, auth);
  return b64urlToB64(a.data);
}

function describeAttachment(part, html) {
  var cid = (partHeader(part, "content-id") || "").replace(/^<|>$/g, "");
  var disp = partHeader(part, "content-disposition");
  var mt = part.mimeType || "application/octet-stream";
  var isInline = /^inline/i.test(disp) || (!!cid && mt.indexOf("image/") === 0 && html.indexOf("cid:" + cid) >= 0);
  return {
    id: part.partId,
    name: decodeMimeWords(part.filename) || ("zalacznik." + (mt.split("/")[1] || "bin")),
    size: (part.body && part.body.size) || 0,
    contentType: mt,
    contentId: cid || null,
    isInline: isInline
  };
}

async function listAttachments(auth, msgId) {
  var m = await gjson("/messages/" + msgId + "?format=full", auth);
  var parts = collectParts(m.payload);
  var value = await mapPool(parts.atts, 4, async function(part) {
    var meta = describeAttachment(part, parts.html);
    // Miniatury obrazków potrzebują bajtów od razu (jak contentBytes w Graph).
    if (meta.contentType.indexOf("image/") === 0 && meta.size > 0 && meta.size < THUMB_LIMIT) {
      meta.contentBytes = await fetchPartBytes(auth, msgId, part);
    }
    return meta;
  });
  return jsonRes({ value: value.filter(Boolean) });
}

async function getAttachment(auth, msgId, partId) {
  var m = await gjson("/messages/" + msgId + "?format=full", auth);
  var parts = collectParts(m.payload);
  var part = parts.atts.filter(function(p) { return String(p.partId) === String(partId); })[0];
  if (!part) return errRes("Nie znaleziono załącznika", 404);
  var meta = describeAttachment(part, parts.html);
  meta.contentBytes = await fetchPartBytes(auth, msgId, part);
  return jsonRes(meta);
}

// ── Wysyłka ──────────────────────────────────────────────────────────────────
function stripHtml(html) {
  return decodeEntities(String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
}

function fmtRecipients(list) {
  return (list || []).map(function(r) {
    var e = r.emailAddress || {};
    if (!e.address) return "";
    if (!e.name || e.name === e.address) return e.address;
    var shown;
    if (/[^\x20-\x7e]/.test(e.name)) shown = encodeHeaderWord(e.name);               // encoded-word
    else if (/[",;<>()@:\\.\[\]]/.test(e.name)) shown = '"' + e.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    else shown = e.name;
    return shown + " <" + e.address + ">";
  }).filter(Boolean).join(", ");
}

var _boundarySeq = 0;
function boundary(tag) { return "=_pd_" + tag + "_" + Date.now().toString(36) + (_boundarySeq++).toString(36); }

function textPart(type, content) {
  return "Content-Type: " + type + "; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" + wrap76(utf8ToB64(content));
}

function filePart(att, inline) {
  var name = encodeHeaderWord(att.name || "plik");
  var asciiName = /^[\x20-\x7e]*$/.test(name) ? name.replace(/"/g, "'") : name;
  var head = "Content-Type: " + (att.contentType || "application/octet-stream") + '; name="' + asciiName + '"\r\n'
    + "Content-Transfer-Encoding: base64\r\n"
    + "Content-Disposition: " + (inline ? "inline" : "attachment") + '; filename="' + asciiName + '"\r\n';
  if (inline && att.contentId) head += "Content-ID: <" + att.contentId + ">\r\n";
  return head + "\r\n" + wrap76(att.contentBytes || "");
}

function buildMime(message) {
  var isHtml = String((message.body && message.body.contentType) || "").toLowerCase() === "html";
  var content = (message.body && message.body.content) || "";
  var atts = message.attachments || [];
  var inlineAtts = atts.filter(function(a) { return a.isInline && a.contentId; });
  var fileAtts = atts.filter(function(a) { return !(a.isInline && a.contentId); });

  var main;
  if (isHtml) {
    var altB = boundary("alt");
    main = "Content-Type: multipart/alternative; boundary=\"" + altB + "\"\r\n\r\n"
      + "--" + altB + "\r\n" + textPart("text/plain", stripHtml(content)) + "\r\n"
      + "--" + altB + "\r\n" + textPart("text/html", content) + "\r\n"
      + "--" + altB + "--";
  } else {
    main = textPart("text/plain", content);
  }

  if (inlineAtts.length) {
    var relB = boundary("rel");
    main = "Content-Type: multipart/related; boundary=\"" + relB + "\"\r\n\r\n"
      + "--" + relB + "\r\n" + main + "\r\n"
      + inlineAtts.map(function(a) { return "--" + relB + "\r\n" + filePart(a, true) + "\r\n"; }).join("")
      + "--" + relB + "--";
  }
  if (fileAtts.length) {
    var mixB = boundary("mix");
    main = "Content-Type: multipart/mixed; boundary=\"" + mixB + "\"\r\n\r\n"
      + "--" + mixB + "\r\n" + main + "\r\n"
      + fileAtts.map(function(a) { return "--" + mixB + "\r\n" + filePart(a, false) + "\r\n"; }).join("")
      + "--" + mixB + "--";
  }

  var headers = ["MIME-Version: 1.0"];
  var to = fmtRecipients(message.toRecipients), cc = fmtRecipients(message.ccRecipients), bcc = fmtRecipients(message.bccRecipients);
  if (to) headers.push("To: " + to);
  if (cc) headers.push("Cc: " + cc);
  if (bcc) headers.push("Bcc: " + bcc);
  headers.push("Subject: " + encodeHeaderWord(message.subject || ""));
  return headers.join("\r\n") + "\r\n" + main;
}

async function sendMail(auth, payload) {
  var message = (payload && payload.message) || {};
  if (!message.toRecipients || !message.toRecipients.length) return errRes("Brak odbiorcy", 400);
  var mime = buildMime(message);
  var r;
  if (mime.length < 3 * 1024 * 1024) {
    var raw = utf8ToB64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    r = await gfetch(GMAIL + "/messages/send", auth, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: raw })
    });
  } else {
    // Duże załączniki: wysyłka surowego RFC 822 przez endpoint upload (do ~35 MB).
    r = await gfetch(GMAIL_UPLOAD + "/messages/send?uploadType=media", auth, {
      method: "POST", headers: { "Content-Type": "message/rfc822" }, body: mime
    });
  }
  if (!r.ok) {
    var e = null; try { e = await r.json(); } catch (x) {}
    return errRes((e && e.error && e.error.message) || ("Błąd wysyłania (" + r.status + ")"), r.status);
  }
  return jsonRes(null, 202);
}

// ── Zmiany stanu wiadomości ──────────────────────────────────────────────────
function modify(auth, id, add, remove) {
  return gjson("/messages/" + id + "/modify", auth, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add || [], removeLabelIds: remove || [] })
  });
}

async function moveMessage(auth, id, dest) {
  if (dest === "deletedItems") {
    await gjson("/messages/" + id + "/trash", auth, { method: "POST" });
  } else if (dest === "junkEmail") {
    await modify(auth, id, ["SPAM"], ["INBOX"]);
  } else if (dest === "inbox") {
    try { await gjson("/messages/" + id + "/untrash", auth, { method: "POST" }); } catch (e) {}
    await modify(auth, id, ["INBOX"], ["SPAM"]);
  }
  return jsonRes({ id: id });
}

async function patchMessage(auth, id, patch) {
  if (patch.isRead != null) {
    await modify(auth, id, patch.isRead ? [] : ["UNREAD"], patch.isRead ? ["UNREAD"] : []);
  }
  if (patch.importance) {
    var high = patch.importance === "high";
    await modify(auth, id, high ? ["STARRED"] : [], high ? [] : ["STARRED"]);
  }
  if (patch.categories) {
    var labels = await loadLabels(auth);
    var cur = await gjson("/messages/" + id + "?format=minimal&fields=labelIds", auth);
    var curUser = (cur.labelIds || []).filter(function(l) { return labels.byId[l] && labels.byId[l].type === "user"; });
    var wanted = [];
    for (var i = 0; i < patch.categories.length; i++) wanted.push(await ensureLabel(auth, patch.categories[i]));
    var add = wanted.filter(function(l) { return curUser.indexOf(l) < 0; });
    var rem = curUser.filter(function(l) { return wanted.indexOf(l) < 0; });
    if (add.length || rem.length) await modify(auth, id, add, rem);
  }
  return jsonRes({ id: id });
}

// ── Kalendarz (Graph /me/events → Google Calendar) ───────────────────────────
async function createEvent(auth, evt) {
  var r = await gfetch(GCAL_EVENTS, auth, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: evt.subject,
      description: evt.body && evt.body.content,
      start: { dateTime: evt.start.dateTime, timeZone: evt.start.timeZone },
      end: { dateTime: evt.end.dateTime, timeZone: evt.end.timeZone }
    })
  });
  if (!r.ok) return errRes("Nie udało się zapisać w Kalendarzu Google (" + r.status + ")", r.status);
  var data = await r.json();
  return jsonRes({ id: data.id, subject: data.summary });
}

// ── Router ───────────────────────────────────────────────────────────────────
export async function gmailFetch(url, init) {
  init = init || {};
  var auth = bearer(init);
  var method = String(init.method || "GET").toUpperCase();
  var u = new URL(url);
  var path = u.pathname.replace(/^\/v1\.0/, "");
  var sp = u.searchParams;
  var m;
  try {
    if ((m = path.match(/^\/me\/mailFolders\/([^/]+)\/messages$/)) && method === "GET") return await listFolder(auth, m[1], sp, url);
    if ((m = path.match(/^\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/)) && method === "GET") return await getAttachment(auth, m[1], decodeURIComponent(m[2]));
    if ((m = path.match(/^\/me\/messages\/([^/]+)\/attachments$/)) && method === "GET") return await listAttachments(auth, m[1]);
    if ((m = path.match(/^\/me\/messages\/([^/]+)\/move$/)) && method === "POST") return await moveMessage(auth, m[1], JSON.parse(init.body || "{}").destinationId);
    if ((m = path.match(/^\/me\/messages\/([^/]+)$/))) {
      if (method === "GET") return await getBody(auth, m[1]);
      if (method === "PATCH") return await patchMessage(auth, m[1], JSON.parse(init.body || "{}"));
      // Trwałe usunięcie wymaga zakresu mail.google.com (poza gmail.modify) — wiadomość
      // w koszu Gmail usuwa sam po 30 dniach. UI nie woła tego dla Gmaila (patrz trashMail).
      if (method === "DELETE") return jsonRes(null, 204);
    }
    if (path === "/me/sendMail" && method === "POST") return await sendMail(auth, JSON.parse(init.body || "{}"));
    if (path === "/me/outlook/masterCategories" && method === "POST") {
      await ensureLabel(auth, JSON.parse(init.body || "{}").displayName);
      return jsonRes({}, 201);
    }
    if (path === "/me/events" && method === "POST") return await createEvent(auth, JSON.parse(init.body || "{}"));
    return errRes("Nieobsługiwane wywołanie: " + method + " " + path, 501);
  } catch (e) {
    return errRes(e.message || "Błąd Gmail", e.status || 500);
  }
}
