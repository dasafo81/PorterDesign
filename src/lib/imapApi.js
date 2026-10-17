// imapApi.js — klient własnej skrzynki (IMAP/SMTP) obsługiwanej przez /api/mail/imap.
//
// Jak gmailApi.js: moduł Mail mówi w dialekcie Graph, a imapFetch() przesyła takie wywołanie
// na serwer, który wykonuje je po IMAP/SMTP i odpowiada w kształcie Graph. Hasło do skrzynki
// zna tylko serwer (zaszyfrowane w bazie) — przeglądarka wysyła je wyłącznie przy łączeniu.
import { SB_KEY } from './supabase.js';
import { refreshSession } from './auth.js';

var ENDPOINT = "/api/mail/imap";

function authHeaders() {
  var raw = localStorage.getItem("sb_session");
  var session = raw ? JSON.parse(raw) : null;
  return session && session.access_token
    ? { apikey: SB_KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" }
    : null;
}

// Jak w oauthBroker: po 401 odświeżamy sesję aplikacji i ponawiamy raz.
function post(payload) {
  function sendOnce() {
    var headers = authHeaders();
    if (!headers) return Promise.reject(new Error("Brak sesji aplikacji"));
    return fetch(ENDPOINT, { method: "POST", headers: headers, body: JSON.stringify(payload) });
  }
  return sendOnce().then(function(r) {
    if (r.status !== 401) return r;
    return refreshSession().then(function(session) {
      return session && session.access_token ? sendOnce() : r;
    });
  });
}

// Zamiennik fetch() dla adresów Graph (wywoływany z mailFetch).
export function imapFetch(url, init) {
  init = init || {};
  return post({ op: "graph", method: init.method || "GET", url: url, body: init.body || null }).then(function(r) {
    if (r.status === 204) return new Response(null, { status: 204 });
    return r.text().then(function(text) {
      return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
    });
  });
}

function readError(r, data) {
  var msg = data && (typeof data.error === "string" ? data.error : data.error && data.error.message);
  return new Error(msg || ("Błąd serwera poczty (" + r.status + ")"));
}

function call(payload) {
  return post(payload).then(function(r) {
    return r.json().catch(function() { return null; }).then(function(data) {
      if (!r.ok) throw readError(r, data);
      return data;
    });
  });
}

// form: { email, username, password, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure }
export function imapConnect(form) { return call(Object.assign({ op: "connect" }, form)); }
export function imapStatus() { return call({ op: "status" }); }
export function imapDisconnect() { return call({ op: "disconnect" }); }

// Typowe ustawienia popularnych polskich i światowych dostawców — formularz podpowiada je po domenie.
var PRESETS = {
  "wp.pl": ["imap.wp.pl", "smtp.wp.pl"], "o2.pl": ["poczta.o2.pl", "poczta.o2.pl"],
  "onet.pl": ["imap.poczta.onet.pl", "smtp.poczta.onet.pl"], "op.pl": ["imap.poczta.onet.pl", "smtp.poczta.onet.pl"],
  "interia.pl": ["poczta.interia.pl", "poczta.interia.pl"], "interia.eu": ["poczta.interia.pl", "poczta.interia.pl"],
  "poczta.fm": ["poczta.interia.pl", "poczta.interia.pl"],
  "icloud.com": ["imap.mail.me.com", "smtp.mail.me.com"], "me.com": ["imap.mail.me.com", "smtp.mail.me.com"],
  "yahoo.com": ["imap.mail.yahoo.com", "smtp.mail.yahoo.com"], "zoho.com": ["imap.zoho.eu", "smtp.zoho.eu"],
  "gmx.com": ["imap.gmx.com", "mail.gmx.com"], "gmx.net": ["imap.gmx.net", "mail.gmx.net"],
  "proton.me": ["127.0.0.1", "127.0.0.1"]
};

// Zwraca podpowiedź serwerów dla adresu e-mail; dla nieznanej domeny zgaduje imap./smtp.<domena>.
export function guessMailServers(email) {
  var m = String(email || "").trim().toLowerCase().match(/@([^@\s]+\.[^@\s]+)$/);
  if (!m) return null;
  var p = PRESETS[m[1]];
  if (p && p[0] === "127.0.0.1") return null; // Proton wymaga lokalnej aplikacji Bridge — nie zadziała z serwera
  return { imap_host: p ? p[0] : "imap." + m[1], smtp_host: p ? p[1] : "smtp." + m[1] };
}
