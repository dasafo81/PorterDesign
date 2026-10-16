// mailClient.js — wybór dostawcy poczty (Microsoft Outlook / Google Gmail).
//
// ScreenMail, CRM i Faktury korzystają tylko z tych funkcji, a nie bezpośrednio
// z msal.js, więc dostawcę da się zmienić bez dotykania logiki UI.
// Wybór dostawcy trzymamy w localStorage (pd_mail_provider); samo połączenie
// (refresh token) siedzi zaszyfrowane w oauth_connections po stronie serwera.
import { msalLogin, msalGetToken, msalGetActiveAccount } from "../msal.js";
import { brokerStart, brokerToken, brokerDisconnect } from "./oauthBroker.js";
import { gmailFetch } from "./gmailApi.js";
import { isDemoMode } from "./demoMock.js";

var PREF_KEY = "pd_mail_provider";
// Wartość PREF_KEY po świadomym wylogowaniu: bez niej zapisane połączenie Microsoft
// (broker trzyma je po stronie serwera) logowałoby użytkownika z powrotem samo.
var SIGNED_OUT = "none";
var GMAIL_SCOPE_RE = /https:\/\/www\.googleapis\.com\/auth\/gmail\.modify/;

export function getMailProvider() {
  if (isDemoMode()) return "microsoft";
  try {
    var pref = localStorage.getItem(PREF_KEY);
    if (pref === SIGNED_OUT) return "microsoft";
    if (pref === "google" || pref === "microsoft") return pref;
    // Brak wyboru: użytkownik, który łączył tylko Gmaila, nie ma połączenia Microsoft.
    if (localStorage.getItem("pd_oauth_gmail") === "1" && localStorage.getItem("pd_oauth_microsoft") !== "1") return "google";
  } catch (e) {}
  return "microsoft";
}

function isSignedOut() {
  if (isDemoMode()) return false;
  try { return localStorage.getItem(PREF_KEY) === SIGNED_OUT; } catch (e) { return false; }
}

export function setMailProvider(provider) {
  try {
    if (provider) localStorage.setItem(PREF_KEY, provider); else localStorage.removeItem(PREF_KEY);
  } catch (e) {}
}

export function mailProviderLabel(provider) {
  return (provider || getMailProvider()) === "google" ? "Gmail" : "Outlook";
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
    data = await brokerToken("google");
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

export async function mailGetToken() {
  return getMailProvider() === "google" ? gmailGetToken() : msalGetToken();
}

export async function mailGetActiveAccount() {
  if (isSignedOut()) return null;
  if (getMailProvider() !== "google") return msalGetActiveAccount();
  try {
    await gmailGetToken();
    return _gAccount;
  } catch (e) {
    if (e && e.code === "MS_INTERACTION_REQUIRED") return null;
    throw e;
  }
}

// Zamiennik fetch() dla adresów Graph: dla Gmaila tłumaczy wywołanie na Gmail API.
export function mailFetch(url, init) {
  if (getMailProvider() === "google" && !isDemoMode()) return gmailFetch(url, init);
  return fetch(url, init);
}

// Przekierowuje do logowania wybranego dostawcy (strona się przeładuje).
export function mailLogin(provider) {
  setMailProvider(provider);
  if (provider === "google") return brokerStart("google", { mail: true });
  return msalLogin();
}

// Wylogowanie z modułu Mail. Outlook: tylko lokalnie (bez przekierowania na stronę
// wylogowania Microsoftu). Gmail: odłącza konto, więc unieważnia też Kalendarz Google.
export async function mailLogout() {
  var provider = getMailProvider();
  _gToken = null; _gExp = 0; _gAccount = null;
  if (provider === "google") {
    await brokerDisconnect("google");
    try {
      ["pd_oauth_gmail", "pd_oauth_google", "pd_gcal_token", "pd_gcal_token_exp", "pd_gcal_hint"]
        .forEach(function(k) { localStorage.removeItem(k); });
    } catch (e) {}
  }
  setMailProvider(SIGNED_OUT);
}
