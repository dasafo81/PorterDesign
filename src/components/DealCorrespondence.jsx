import React, { useState, useEffect } from 'react';
import { mailGetToken, mailGetActiveAccount, mailFetch } from '../lib/mailClient.js';

var ce = React.createElement;

// ── KORESPONDENCJA Z KLIENTEM W KARCIE DEALA ─────────────────────────────────
// Szuka w skrzynce (Outlook / Gmail / własna — przez mailFetch) wiadomości odebranych
// od klienta i wysłanych do niego, po jego adresie e-mail, i pokazuje je jako jedną
// oś czasu. Nic nie jest kopiowane do bazy — skrzynka pozostaje źródłem prawdy.
var SELECT = "subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,hasAttachments";
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
        id: m.id, out: out, subject: m.subject || "(bez tematu)", preview: m.bodyPreview || "",
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

  return ce("div", { style: { border: "1px solid var(--bd2)", borderRadius: 9, background: "var(--bg)", overflow: "hidden" } },
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
    open ? ce("div", { style: { padding: "0 10px 10px 32px", fontSize: 12, color: "var(--t2)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflowY: "auto" } },
      busy ? "Wczytywanie…" : (body || m.preview)
    ) : null
  );
}

export function DealCorrespondence(p) {
  // p.email — adres klienta
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
    (rows || []).map(function (m) { return ce(MailRow, { key: m.id, m: m }); }),
    ce("button", {
      onClick: function () { setTick(tick + 1); }, disabled: busy,
      style: { alignSelf: "flex-start", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--bd2)", background: "transparent", color: "var(--t2)", fontSize: 12, cursor: busy ? "not-allowed" : "pointer" }
    }, "↻ Odśwież")
  );
}
