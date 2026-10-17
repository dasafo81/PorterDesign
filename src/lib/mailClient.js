// mailClient.js — wybór dostawcy poczty (Microsoft Outlook / Google Gmail / własna skrzynka IMAP).
//
// ScreenMail, CRM i Faktury korzystają tylko z tych funkcji, a nie bezpośrednio
// z msal.js, więc dostawcę da się zmienić bez dotykania logiki UI.
// Wybór dostawcy trzymamy w localStorage (pd_mail_provider); samo połączenie
// (refresh token) siedzi zaszyfrowane w oauth_connections po stronie serwera.
import { msalLogin, msalGetToken, msalGetActiveAccount, msalForget } from "../msal.js";
import { brokerStart, brokerToken, brokerDisconnect, brokerStatus } from "./oauthBroker.js";
import { gmailFetch } from "./gmailApi.js";
import { imapFetch, imapConnect, imapStatus, imapDisconnect } from "./imapApi.js";
import { isDemoMode } from "./demoMock.js";

var PREF_KEY = "pd_mail_provider";
var GMAIL_SCOPE_RE = /https:\/\/www\.googleapis\.com\/auth\/gmail\.modify/;

export function getMailProvider() {
  if (isDemoMode()) return "microsoft";
  try {
    var pref = localStorage.getItem(PREF_KEY);
    if (pref === "google" || pref === "microsoft" || pref === "custom") return pref;
    // Brak wyboru: użytkownik, który łączył tylko Gmaila, nie ma połączenia Microsoft.
    if (localStorage.getItem("pd_oauth_gmail") === "1" && localStorage.getItem("pd_oauth_microsoft") !== "1") return "google";
  } catch (e) {}
  return "microsoft";
}

export function setMailProvider(provider) {
  try {
    if (provider) localStorage.setItem(PREF_KEY, provider); else localStorage.removeItem(PREF_KEY);
  } catch (e) {}
}

export function mailProviderLabel(provider) {
  var p = provider || getMailProvider();
  return p === "google" ? "Gmail" : p === "custom" ? "Poczta" : "Outlook";
}

// ── Gmail: token z brokera (refresh po stronie serwera) ──────────────────────
var _gToken = null, _gExp = 0, _gAccount = null;

function reconnectError(code) {
  var e = new Error("MS_INTERACTION_REQUIRED");
  e.code = "MS_INTERACTION_REQUIRED";
  e.cause = code;
  return e;
}

async function gmailGetToken() {
  if (_gToken && Date.now() < _gExp) return _gToken;
  var data;
  try {
    data = await brokerToken("google", { mail: true });
  } catch (e) {
    if (e && e.code === "OAUTH_RECONNECT_REQUIRED") throw reconnectError(e.code);
    throw e;
  }
  // Połączenie Google bywa założone tylko dla kalendarza — bez zakresu Gmail nie ma czego czytać.
  if (!GMAIL_SCOPE_RE.test(data.scope || "")) throw reconnectError("GMAIL_SCOPE_MISSING");
  _gToken = data.access_token;
  _gExp = Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000;
  _gAccount = { username: data.provider_email || "Konto Gmail", email: data.provider_email || "" };
  try { localStorage.setItem("pd_oauth_gmail", "1"); localStorage.setItem("pd_oauth_google", "1"); } catch (e) {}
  return _gToken;
}

// ── Własna skrzynka (IMAP/SMTP): dane logowania zna tylko serwer ────────────────
// Reszta aplikacji oczekuje "tokenu", więc dla własnej skrzynki zwracamy znacznik —
// imapFetch() i tak uwierzytelnia się sesją aplikacji, a nie tym tokenem.
var CUSTOM_TOKEN = "imap-session";
var _cAccount = null;

async function customActiveAccount() {
  if (_cAccount) return _cAccount;
  var st = await imapStatus();
  if (!st || !st.connected) return null;
  _cAccount = { username: st.email, email: st.email };
  return _cAccount;
}

// Łączy własną skrzynkę (serwer sprawdza IMAP i SMTP przed zapisem) i od razu ją aktywuje.
export async function mailConnectCustom(form) {
  var res = await imapConnect(form);
  _cAccount = { username: res.email, email: res.email };
  setMailProvider("custom");
  return _cAccount;
}

export async function mailGetToken() {
  var provider = getMailProvider();
  if (provider === "custom") {
    var acc = await customActiveAccount();
    if (!acc) throw reconnectError("CUSTOM_NOT_CONNECTED");
    return CUSTOM_TOKEN;
  }
  return provider === "google" ? gmailGetToken() : msalGetToken();
}

// Powód ostatniej nieudanej autoryzacji — ekran logowania pokazuje go po powrocie z OAuth,
// zamiast po cichu wracać do wyboru skrzynki.
var _issue = null;
export function mailAuthIssue() { return _issue; }

async function gmailActiveAccount() {
  try {
    await gmailGetToken();
    return _gAccount;
  } catch (e) {
    if (e && e.code === "MS_INTERACTION_REQUIRED") {
      _issue = e.cause === "GMAIL_SCOPE_MISSING" ? "gmail_scope" : "reconnect";
      return null;
    }
    _issue = "error:" + (e && e.message || "nieznany błąd");
    throw e;
  }
}

async function microsoftActiveAccount() {
  try {
    return await msalGetActiveAccount();
  } catch (e) {
    _issue = "error:" + (e && e.message || "nieznany błąd");
    throw e;
  }
}

// Skrzynka, do której użytkownik MDL ma się zalogować automatycznie: ta, której ostatnio używał
// na tym urządzeniu (pd_mail_provider), a na nowym urządzeniu — ostatnio połączona z jego kontem
// (połączenia siedzą na serwerze). Bez wylogowania wracamy więc do niej bez ponownego logowania.
export async function mailGetActiveAccount() {
  if (isDemoMode()) return msalGetActiveAccount();
  _issue = null;
  var pref = null;
  try { pref = localStorage.getItem(PREF_KEY); } catch (e) {}
  if (pref === "google") return gmailActiveAccount();
  if (pref === "microsoft") return microsoftActiveAccount();
  if (pref === "custom") return customActiveAccount();

  var list = await brokerStatus();
  if (list) {
    var usable = list.filter(function(c) {
      return c.provider === "microsoft" || (c.provider === "google" && !c.mail_disabled && GMAIL_SCOPE_RE.test(c.scopes || ""));
    }); // serwer zwraca najnowsze pierwsze
    for (var i = 0; i < usable.length; i++) {
      var acc = usable[i].provider === "google" ? await gmailActiveAccount() : await microsoftActiveAccount();
      if (acc) { setMailProvider(usable[i].provider); return acc; }
    }
    var hasGoogle = list.some(function(c) { return c.provider === "google"; });
    // Własna skrzynka nie jest w oauth_connections — sprawdzamy ją osobno, zanim uznamy brak połączeń.
    var cust = await customActiveAccount().catch(function() { return null; });
    if (cust) { setMailProvider("custom"); return cust; }
    if (!usable.length && hasGoogle) _issue = "gmail_scope";
    if (usable.length) return null;
  }
  // Brak listy z serwera albo brak połączeń: stara ścieżka (np. cache MSAL sprzed brokera).
  var ms = await microsoftActiveAccount();
  if (ms) setMailProvider("microsoft");
  return ms;
}

// Zamiennik fetch() dla adresów Graph: dla Gmaila tłumaczy wywołanie na Gmail API.
export function mailFetch(url, init) {
  var provider = getMailProvider();
  if (provider === "google" && !isDemoMode()) return gmailFetch(url, init);
  if (provider === "custom" && !isDemoMode()) return imapFetch(url, init);
  return fetch(url, init);
}

// Przekierowuje do logowania wybranego dostawcy (strona się przeładuje).
export function mailLogin(provider) {
  setMailProvider(provider);
  if (provider === "google") return brokerStart("google", { mail: true });
  return msalLogin();
}

// Wylogowanie z modułu Mail, inaczej zapisane połączenie logowałoby użytkownika z powrotem samo.
// Outlook: połączenie jest kasowane. Gmail: tylko wyłączamy pocztę — Kalendarz Google działa na
// tym samym połączeniu i ma zostać. Błąd serwera przerywa wylogowanie (wyjątek), żeby UI nie
// udawał wylogowania, po którym skrzynka i tak wróci.
export async function mailLogout() {
  var provider = getMailProvider();
  if (provider === "custom") await imapDisconnect(); else await brokerDisconnect(provider, { mail: true });
  _gToken = null; _gExp = 0; _gAccount = null; _cAccount = null;
  if (provider === "custom") {
    // hasło skrzynki skasowane na serwerze — nic więcej do sprzątania lokalnie
  } else if (provider === "google") {
    try { localStorage.removeItem("pd_oauth_gmail"); } catch (e) {}
  } else {
    msalForget();
  }
  setMailProvider(null);
}
