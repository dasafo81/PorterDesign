// msal.js — Microsoft Authentication Library dla Porter Design Assistant
// Multi-tenant: authority = /common — obsługuje dowolny Azure AD + konta osobiste MS
import * as msal from "@azure/msal-browser";
import { brokerStart, brokerToken } from "./lib/oauthBroker.js";

var CLIENT_ID = "ad714f55-19fb-4a5e-90a5-4253846e9338";

export var MSAL_SCOPES = [
  "Mail.Send",
  "Mail.ReadWrite",
  "Calendars.ReadWrite"
];

var msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true
  }
};

var _instance = null;
var _initPromise = null;
var _brokerToken = null;
var _brokerTokenExpiresAt = 0;
var _brokerAccount = null;

function rememberBrokerToken(data) {
  _brokerToken = data.access_token;
  _brokerTokenExpiresAt = Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000;
  _brokerAccount = {
    username: data.provider_email || "Połączone konto Microsoft",
    email: data.provider_email || ""
  };
  localStorage.setItem("pd_oauth_microsoft", "1");
  return _brokerToken;
}

async function getBrokerToken() {
  if (_brokerToken && Date.now() < _brokerTokenExpiresAt) return _brokerToken;
  return rememberBrokerToken(await brokerToken("microsoft"));
}

function getInstance() {
  if (_initPromise) return _initPromise;
  _instance = new msal.PublicClientApplication(msalConfig);
  _initPromise = _instance.initialize().then(function(){
    // Obsłuż redirect po powrocie z Microsoftu
    return _instance.handleRedirectPromise();
  }).then(function(response){
    return _instance;
  });
  return _initPromise;
}

// Inicjalizuj od razu przy załadowaniu modułu (żeby przechwycić redirect)
getInstance().catch(function(e){console.error("MSAL init error",e);});

export async function msalLogin() {
  return brokerStart("microsoft");
  var inst = await getInstance();
  // Redirect zamiast popup — bardziej niezawodne na tablecie/mobile
  await inst.loginRedirect({ scopes: MSAL_SCOPES });
  // Funkcja nigdy nie wróci — strona się przeładuje
  return null;
}

export async function msalGetToken() {
  // Połączenie jest zapisane na backendzie, więc nie uzależniaj go od znacznika
  // localStorage. Znacznik znika po wyczyszczeniu danych, zmianie urządzenia lub
  // niektórych aktualizacjach PWA, mimo że refresh token nadal jest ważny.
  try {
    return await getBrokerToken();
  } catch (e) {
    if (e && e.code !== "OAUTH_RECONNECT_REQUIRED") throw e;
  }
  var inst = await getInstance();
  var accounts = inst.getAllAccounts();
  if (!accounts.length) throw new Error("Brak zalogowanego konta MS");
  try {
    var result = await inst.acquireTokenSilent({
      scopes: MSAL_SCOPES,
      account: accounts[0]
    });
    return result.accessToken;
  } catch (e) {
    // Silent refresh nie zadziałał — odróżniamy interakcję wymaganą od innych błędów
    if (e && (e.name === "InteractionRequiredAuthError" || e.errorCode === "interaction_required" || e.errorCode === "consent_required" || e.errorCode === "login_required" || e.errorCode === "timed_out" || e.errorCode === "monitor_window_timeout")) {
      // Sygnalizujemy wywołującemu, że trzeba interakcji — niech UI zdecyduje
      var err = new Error("MS_INTERACTION_REQUIRED");
      err.code = "MS_INTERACTION_REQUIRED";
      throw err;
    }
    // Inne błędy (sieć itp.) — propaguj jak są
    throw e;
  }
}

export async function msalGetActiveAccount() {
  if (_brokerAccount) return _brokerAccount;
  try {
    await getBrokerToken();
    return _brokerAccount;
  } catch (e) {
    if (e && e.code !== "OAUTH_RECONNECT_REQUIRED") throw e;
  }
  var inst = await getInstance();
  var accounts = inst.getAllAccounts();
  return accounts[0] || null;
}

export async function msalLogout() {
  var inst = await getInstance();
  var accounts = inst.getAllAccounts();
  await inst.logoutRedirect({
    account: accounts[0] || null,
    postLogoutRedirectUri: window.location.origin
  });
}
