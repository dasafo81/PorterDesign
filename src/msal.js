// msal.js — Microsoft Authentication Library dla Porter Design Assistant
import * as msal from "@azure/msal-browser";

var CLIENT_ID = "ad714f55-19fb-4a5e-90a5-4253846e9338";
var TENANT_ID = "d2f92663-b7a9-47ff-87f1-8746f1f9b3ad";

export var MSAL_SCOPES = [
  "Mail.Send",
  "Mail.ReadWrite",
  "Calendars.ReadWrite"
];

var msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: "https://login.microsoftonline.com/" + TENANT_ID,
    redirectUri: window.location.origin
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true
  }
};

var _instance = null;
var _initPromise = null;

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
  var inst = await getInstance();
  // Redirect zamiast popup — bardziej niezawodne na tablecie/mobile
  await inst.loginRedirect({ scopes: MSAL_SCOPES });
  // Funkcja nigdy nie wróci — strona się przeładuje
  return null;
}

export async function msalGetToken() {
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
    if (e && (e.name === "InteractionRequiredAuthError" || e.errorCode === "interaction_required" || e.errorCode === "consent_required" || e.errorCode === "login_required")) {
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
