// gcal.js — Google Calendar OAuth dla Porter Design Assistant
// Używa Google Identity Services (GIS) — token client (implicit flow)
// Silent refresh: gdy token wygaśnie, ponawiamy requestAccessToken({prompt:""})
// w tle — Google odpowie automatycznie jeśli sesja w przeglądarce jest aktywna.

export var GCAL_CLIENT_ID = "818744143681-cab0a79h5hoo4l4cracnltnh2bldi62r.apps.googleusercontent.com";
export var GCAL_SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

var TOKEN_KEY = "pd_gcal_token";
var TOKEN_EXP_KEY = "pd_gcal_token_exp";
var REFRESH_MARGIN_MS = 60 * 1000; // odśwież minutę przed wygaśnięciem

var _gisReadyPromise = null;
var _tokenClient = null;

// ── GIS loader ───────────────────────────────────────────────────────────────
function loadGSI() {
  if (_gisReadyPromise) return _gisReadyPromise;
  _gisReadyPromise = new Promise(function(resolve, reject){
    if (typeof window === "undefined") { reject(new Error("Brak window")); return; }
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve(window.google);
      return;
    }
    var existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", function(){ resolve(window.google); });
      existing.addEventListener("error", function(){ reject(new Error("Nie udało się załadować Google Identity Services")); });
      return;
    }
    var sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client";
    sc.async = true;
    sc.defer = true;
    sc.onload = function(){ resolve(window.google); };
    sc.onerror = function(){ reject(new Error("Nie udało się załadować Google Identity Services")); };
    document.head.appendChild(sc);
  });
  return _gisReadyPromise;
}

// Inicjalizuj loader od razu (analogicznie do MSAL)
loadGSI().catch(function(e){ console.error("GIS init error", e); });

// ── Token cache ──────────────────────────────────────────────────────────────
function readCachedToken() {
  try {
    var t = localStorage.getItem(TOKEN_KEY);
    var e = localStorage.getItem(TOKEN_EXP_KEY);
    if (!t || !e) return null;
    var exp = Number(e);
    if (!exp || isNaN(exp)) return null;
    return { token: t, exp: exp };
  } catch (x) { return null; }
}

function writeCachedToken(token, expiresInSec) {
  try {
    var exp = Date.now() + (expiresInSec || 3600) * 1000;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXP_KEY, String(exp));
  } catch (x) {}
}

function clearCachedToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
  } catch (x) {}
}

function isExpired(exp) {
  return !exp || Date.now() >= (exp - REFRESH_MARGIN_MS);
}

// ── Public API ───────────────────────────────────────────────────────────────

// Czy GIS jest załadowany — przydatne dla UI ("przyciski disabled dopóki nie ready")
export function gcalReady() {
  return !!(typeof window !== "undefined" && window.google && window.google.accounts && window.google.accounts.oauth2);
}

// Promise który rozwiązuje się gdy GIS jest gotowy
export function gcalWaitReady() {
  return loadGSI();
}

// Pierwszy login z UI (consent screen Google)
export function gcalLogin() {
  return loadGSI().then(function(){
    return new Promise(function(resolve, reject){
      var client = window.google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPES,
        callback: function(resp){
          if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
          writeCachedToken(resp.access_token, resp.expires_in);
          resolve(resp.access_token);
        },
        error_callback: function(err){
          reject(new Error((err && err.message) || "Logowanie Google anulowane"));
        }
      });
      client.requestAccessToken({ prompt: "consent" });
    });
  });
}

// Silent refresh — wywołuje GIS z prompt:"" (Google zwróci token bez UI jeśli sesja aktywna)
function silentRefresh() {
  return loadGSI().then(function(){
    return new Promise(function(resolve, reject){
      var settled = false;
      var client = window.google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPES,
        callback: function(resp){
          if (settled) return;
          settled = true;
          if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
          writeCachedToken(resp.access_token, resp.expires_in);
          resolve(resp.access_token);
        },
        error_callback: function(err){
          if (settled) return;
          settled = true;
          // Najczęściej: użytkownik wylogowany z Google albo cofnął uprawnienia
          var e = new Error("GCAL_INTERACTION_REQUIRED");
          e.code = "GCAL_INTERACTION_REQUIRED";
          e.cause = err;
          reject(e);
        }
      });
      // prompt:"" → tylko gdy sesja Google aktywna; brak UI consent
      client.requestAccessToken({ prompt: "" });
      // Awaryjny timeout — jeśli GIS nic nie odpowie w 8s, traktujemy to jako interakcję wymaganą
      setTimeout(function(){
        if (settled) return;
        settled = true;
        var e = new Error("GCAL_INTERACTION_REQUIRED");
        e.code = "GCAL_INTERACTION_REQUIRED";
        reject(e);
      }, 8000);
    });
  });
}

// Główna funkcja — zwraca świeży access token albo rzuca GCAL_INTERACTION_REQUIRED
// Wywołujący powinien złapać ten błąd i wyświetlić UI logowania
export function gcalGetToken() {
  var cached = readCachedToken();
  if (cached && !isExpired(cached.exp)) {
    return Promise.resolve(cached.token);
  }
  // Wygasł albo nie ma — próbujemy silent refresh
  return silentRefresh();
}

// Czy mamy w cache jakiś token (niekoniecznie ważny) — przydatne dla UI
// "czy Paulina kiedykolwiek się zalogowała na tej maszynie"
export function gcalHasSession() {
  var cached = readCachedToken();
  return !!(cached && cached.token);
}

// Czy mamy aktualnie ważny token (bez prób refresh)
export function gcalHasValidToken() {
  var cached = readCachedToken();
  return !!(cached && !isExpired(cached.exp));
}

export function gcalLogout() {
  var cached = readCachedToken();
  clearCachedToken();
  // Best-effort revoke — nie blokujemy UI jeśli się nie uda
  if (cached && cached.token && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try { window.google.accounts.oauth2.revoke(cached.token, function(){}); } catch (x) {}
  }
  return Promise.resolve();
}
