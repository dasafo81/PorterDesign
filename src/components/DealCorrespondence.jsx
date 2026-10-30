import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { mailGetToken, mailGetActiveAccount, mailFetch } from '../lib/mailClient.js';

var ce = React.createElement;

// ── KORESPONDENCJA Z KLIENTEM W KARCIE DEALA ─────────────────────────────────
// Szuka w skrzynce (Outlook / Gmail / własna — przez mailFetch) wiadomości odebranych
// od klienta i wysłanych do niego, po jego adresie e-mail, i pokazuje je jako jedną
// oś czasu. Nic nie jest kopiowane do bazy — skrzynka pozostaje źródłem prawdy.
var SELECT = "subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,conversationId";
var PER_FOLDER = 25;

function addrOf(r) { return String((r && r.emailAddress && r.emailAddress.address) || "").toLowerCase(); }

function involves(m, email) {
  var list = [m.from].concat(m.toRecipients || [], m.ccRecipients || []);
  return list.some(function (r) { return addrOf(r) === email; });
}

function fetchFolder(token, folder, email) {
  var url = "https://graph.microsoft.com/v1.0/me/mailFolders/" + folder + "/messages"
    + "?$search=" + encodeURIComponent('"' + email + '"')
    + "&$top=" + PER_FOLDER + "&$select=" + encodeURIComponent(SELECT);
  return mailFetch(url, { headers: { "Authorization": "Bearer " + token } }).then(function (r) {
    if (!r.ok) throw new Error("Błąd odczytu poczty (" + r.status + ")");
    return r.json();
  }).then(function (data) {
    return (data.value || []).filter(function (m) { return involves(m, email); }).map(function (m) {
      var out = folder === "sentItems";
      return {
        id: m.id, convId: m.conversationId || null, out: out, subject: m.subject || "(bez tematu)", preview: m.bodyPreview || "",
        date: (out ? m.sentDateTime : m.receivedDateTime) || m.receivedDateTime || m.sentDateTime || "",
        hasAtt: !!m.hasAttachments,
        who: out ? (m.toRecipients || []).map(function (r) { return r.emailAddress.name || r.emailAddress.address; }).join(", ")
          : ((m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || ""),
      };
    });
  });
}

function htmlToText(html) {
  try {
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("style,script,head").forEach(function (n) { n.remove(); });
    return (doc.body.innerText || doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch (e) { return ""; }
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return iso; }
}

// ── ZAŁĄCZNIKI ───────────────────────────────────────────────────────────────
// Jeden GET listy załączników (bez $select) zwraca metadane + contentBytes dla plików <3 MB.
function loadAttachments(mid) {
  return mailGetToken().then(function (tok) {
    return mailFetch("https://graph.microsoft.com/v1.0/me/messages/" + mid + "/attachments", { headers: { "Authorization": "Bearer " + tok } });
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    return ((data && data.value) || []).filter(function (a) { return !a.isInline; });
  });
}

// Większe pliki nie mają contentBytes na liście — dociągamy je osobno, dopiero na kliknięcie.
function fullAttachment(mid, att) {
  if (att.contentBytes) return Promise.resolve(att);
  return mailGetToken().then(function (tok) {
    return mailFetch("https://graph.microsoft.com/v1.0/me/messages/" + mid + "/attachments/" + att.id, { headers: { "Authorization": "Bearer " + tok } });
  }).then(function (r) { return r.ok ? r.json() : null; });
}

function isImage(a) { return !!a.contentType && a.contentType.indexOf("image/") === 0; }
function isPdf(a) { return /pdf/i.test(a.contentType || "") || /\.pdf$/i.test(a.name || ""); }
function dataUri(a) { return "data:" + (a.contentType || "image/jpeg") + ";base64," + a.contentBytes; }

function blobUrl(a) {
  var bin = atob(a.contentBytes), buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([buf], { type: a.contentType || "application/octet-stream" }));
}

function fmtSize(n) {
  if (!n) return "";
  return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB";
}

function fileIcon(a) {
  if (isPdf(a)) return "📕";
  if (/sheet|excel|\.xlsx?$|\.csv$/i.test((a.contentType || "") + (a.name || ""))) return "📗";
  if (/word|\.docx?$/i.test((a.contentType || "") + (a.name || ""))) return "📘";
  return "📄";
}

// Pobranie / otwarcie pliku. Okno otwieramy synchronicznie, inaczej przeglądarka zablokuje popup po async fetch.
function openAttachment(mid, att) {
  var win = (isPdf(att)) ? window.open("", "_blank") : null;
  return fullAttachment(mid, att).then(function (full) {
    if (!full || !full.contentBytes) { if (win) win.close(); alert("Nie udało się pobrać załącznika."); return; }
    full = Object.assign({}, att, full);
    var url = blobUrl(full);
    if (win) { win.location.href = url; return; }
    var a = document.createElement("a");
    a.href = url; a.download = full.name || "zalacznik";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }).catch(function () { if (win) win.close(); alert("Nie udało się pobrać załącznika."); });
}

function Lightbox(p) {
  // p.mid, p.images (lista załączników-obrazków), p.start, p.onClose
  var sIdx = useState(p.start), idx = sIdx[0], setIdx = sIdx[1];
  var sUri = useState({}), uris = sUri[0], setUris = sUri[1];
  var att = p.images[idx];

  useEffect(function () {
    if (uris[att.id]) return;
    var alive = true;
    fullAttachment(p.mid, att).then(function (full) {
      if (!alive || !full || !full.contentBytes) return;
      setUris(function (prev) { var n = Object.assign({}, prev); n[att.id] = dataUri(Object.assign({}, att, full)); return n; });
    });
    return function () { alive = false; };
  }, [idx]);

  function step(d) { setIdx((idx + d + p.images.length) % p.images.length); }

  useEffect(function () {
    function onKey(e) {
      if (e.key === "Escape") p.onClose();
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  });

  var btn = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 22, cursor: "pointer" };
  return createPortal(ce("div", { onClick: p.onClose, style: { position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center" } },
    uris[att.id]
      ? ce("img", { src: uris[att.id], onClick: function (e) { e.stopPropagation(); }, style: { maxWidth: "92vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 6 } })
      : ce("div", { style: { color: "#bbb", fontSize: 14 } }, "⏳ Ładowanie…"),
    p.images.length > 1 ? ce("button", { onClick: function (e) { e.stopPropagation(); step(-1); }, style: Object.assign({ left: 16 }, btn) }, "‹") : null,
    p.images.length > 1 ? ce("button", { onClick: function (e) { e.stopPropagation(); step(1); }, style: Object.assign({ right: 16 }, btn) }, "›") : null,
    ce("button", { onClick: function (e) { e.stopPropagation(); p.onClose(); }, style: Object.assign({}, btn, { top: 24, right: 16, transform: "none", fontSize: 18 }) }, "✕"),
    ce("div", { onClick: function (e) { e.stopPropagation(); }, style: { position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", color: "#ddd", fontSize: 12 } },
      att.name + (p.images.length > 1 ? "  (" + (idx + 1) + "/" + p.images.length + ")" : "") + "  ",
      ce("a", { href: "#", onClick: function (e) { e.preventDefault(); openAttachment(p.mid, att); }, style: { color: "#fff", textDecoration: "underline" } }, "Pobierz")
    )
  ), document.body);
}

function Attachments(p) {
  // p.mid — id wiadomości
  var sAtts = useState(null), atts = sAtts[0], setAtts = sAtts[1];
  var sLb = useState(null), lb = sLb[0], setLb = sLb[1];

  useEffect(function () {
    var alive = true;
    loadAttachments(p.mid).then(function (l) { if (alive) setAtts(l); }).catch(function () { if (alive) setAtts([]); });
    return function () { alive = false; };
  }, [p.mid]);

  if (atts === null) return ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 8 } }, "Wczytywanie załączników…");
  if (!atts.length) return null;
  var images = atts.filter(isImage);

  return ce("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 } },
    atts.map(function (a) {
      if (isImage(a)) {
        var idx = images.indexOf(a);
        return ce("div", { key: a.id, title: a.name, onClick: function () { setLb(idx); },
          style: { width: 72, height: 72, borderRadius: 8, border: "1px solid var(--bd2)", overflow: "hidden", cursor: "zoom-in", background: "var(--bg2,#f4f4f2)", display: "flex", alignItems: "center", justifyContent: "center" } },
          a.contentBytes ? ce("img", { src: dataUri(a), style: { width: "100%", height: "100%", objectFit: "cover" } }) : ce("span", { style: { fontSize: 22 } }, "🖼️")
        );
      }
      return ce("div", { key: a.id, title: a.name, onClick: function () { openAttachment(p.mid, a); },
        style: { display: "flex", alignItems: "center", gap: 6, maxWidth: 220, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd2)", cursor: "pointer", background: "var(--bg2,#f4f4f2)" } },
        ce("span", { style: { fontSize: 18 } }, fileIcon(a)),
        ce("div", { style: { minWidth: 0 } },
          ce("div", { style: { fontSize: 12, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.name),
          ce("div", { style: { fontSize: 10, color: "var(--t3)" } }, fmtSize(a.size))
        )
      );
    }),
    lb !== null ? ce(Lightbox, { mid: p.mid, images: images, start: lb, onClose: function () { setLb(null); } }) : null
  );
}

function MailRow(p) {
  var m = p.m;
  var sOpen = useState(false), open = sOpen[0], setOpen = sOpen[1];
  var sBody = useState(null), body = sBody[0], setBody = sBody[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];

  function toggle() {
    var next = !open;
    setOpen(next);
    if (!next || body !== null) return;
    setBusy(true);
    mailGetToken().then(function (tok) {
      return mailFetch("https://graph.microsoft.com/v1.0/me/messages/" + m.id + "?$select=body", { headers: { "Authorization": "Bearer " + tok } });
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      var b = data && data.body;
      var txt = b ? (/html/i.test(b.contentType) ? htmlToText(b.content) : String(b.content || "")) : "";
      setBody(txt || m.preview);
    }).catch(function () { setBody(m.preview); }).finally(function () { setBusy(false); });
  }

  return ce("div", { style: { flexShrink: 0, border: "1px solid var(--bd2)", borderRadius: 9, background: "var(--bg)", overflow: "hidden" } },
    ce("div", { onClick: toggle, style: { display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", cursor: "pointer" } },
      ce("span", { title: m.out ? "Wysłane" : "Odebrane", style: { fontSize: 14, lineHeight: "18px", color: m.out ? "var(--t1)" : "var(--gr)" } }, m.out ? "↗" : "↙"),
      ce("div", { style: { flex: 1, minWidth: 0 } },
        ce("div", { style: { display: "flex", gap: 8, justifyContent: "space-between", alignItems: "baseline" } },
          ce("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (m.hasAtt ? "📎 " : "") + m.subject),
          ce("span", { style: { fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" } }, fmtDate(m.date))
        ),
        ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 1 } }, (m.out ? "Do: " : "Od: ") + m.who),
        open ? null : ce("div", { style: { fontSize: 12, color: "var(--t2)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.preview)
      )
    ),
    open ? ce("div", { style: { padding: "0 10px 10px 32px" } },
      ce("div", { style: { fontSize: 12, color: "var(--t2)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" } },
        busy ? "Wczytywanie…" : (body || m.preview)
      ),
      m.hasAtt ? ce(Attachments, { mid: m.id }) : null,
      p.onOpenMail ? ce("button", {
        onClick: function () { p.onOpenMail(m); },
        title: "Otwórz tę wiadomość w module Poczta, aby odpisać",
        style: { marginTop: 10, padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--t1)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }
      }, "✉ Otwórz w Poczcie i odpisz") : null
    ) : null
  );
}

export function DealCorrespondence(p) {
  // p.email — adres klienta, p.onOpenMail(m) — przejście do wiadomości w module Poczta
  var email = String(p.email || "").trim().toLowerCase();
  var sRows = useState(null), rows = sRows[0], setRows = sRows[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];
  var sTick = useState(0), tick = sTick[0], setTick = sTick[1];

  useEffect(function () {
    if (!email) return;
    var alive = true;
    setBusy(true); setErr(null);
    mailGetActiveAccount().then(function (acc) {
      if (!acc) { var e = new Error("Zaloguj się do poczty (zakładka Poczta), aby zobaczyć korespondencję."); e.soft = true; throw e; }
      return mailGetToken();
    }).then(function (tok) {
      return Promise.all([fetchFolder(tok, "inbox", email), fetchFolder(tok, "sentItems", email)]);
    }).then(function (res) {
      if (!alive) return;
      var all = res[0].concat(res[1]);
      all.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      setRows(all);
    }).catch(function (e) {
      if (!alive) return;
      setRows([]);
      setErr(e && e.code === "MS_INTERACTION_REQUIRED" ? "Sesja poczty wygasła — zaloguj się ponownie w zakładce Poczta." : ((e && e.message) || "Nie udało się wczytać korespondencji."));
    }).finally(function () { if (alive) setBusy(false); });
    return function () { alive = false; };
  }, [email, tick]);

  if (!email) return ce("div", { style: { fontSize: 12, color: "var(--t3)" } }, "Klient nie ma adresu e-mail — uzupełnij go w karcie klienta.");

  return ce(React.Fragment, null,
    busy ? ce("div", { style: { fontSize: 12, color: "var(--t3)" } }, "Wczytywanie korespondencji…") : null,
    err ? ce("div", { style: { fontSize: 12, color: "var(--rd, #c0392b)" } }, err) : null,
    (!busy && !err && rows && !rows.length) ? ce("div", { style: { fontSize: 12, color: "var(--t3)" } }, "Brak wiadomości wymienionych z " + email + ".") : null,
    (rows && rows.length) ? ce("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 350, overflowY: "auto", paddingRight: 4 } },
      rows.map(function (m) { return ce(MailRow, { key: m.id, m: m, onOpenMail: p.onOpenMail }); })
    ) : null,
    ce("button", {
      onClick: function () { setTick(tick + 1); }, disabled: busy,
      style: { alignSelf: "flex-start", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--bd2)", background: "transparent", color: "var(--t2)", fontSize: 12, cursor: busy ? "not-allowed" : "pointer" }
    }, "↻ Odśwież")
  );
}
