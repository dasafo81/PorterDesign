// src/lib/auth.js
// Zarządzanie sesją Supabase Auth (signIn, signOut, refresh)

import { SB_URL, SB_KEY } from './supabase.js';

var _session = null;

// Wczytaj sesję z localStorage przy starcie aplikacji
export function loadSession() {
  try {
    var raw = localStorage.getItem('sb_session');
    if (raw) _session = JSON.parse(raw);
  } catch (e) {
    _session = null;
  }
  return _session;
}

export function getSession() {
  return _session;
}

export function getAccessToken() {
  return _session ? _session.access_token : null;
}

export function getSessionUser() {
  return _session ? _session.user : null;
}

function saveSession(s) {
  _session = s;
  if (s) {
    localStorage.setItem('sb_session', JSON.stringify(s));
  } else {
    localStorage.removeItem('sb_session');
  }
}

// Zaloguj e-mail + hasło → zwraca Promise z sesją
export function signIn(email, password) {
  return fetch(SB_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: email, password: password })
  })
  .then(function(r) {
    if (!r.ok) {
      return r.json().then(function(e) {
        throw new Error(e.error_description || e.msg || 'Błąd logowania');
      });
    }
    return r.json();
  })
  .then(function(data) {
    saveSession(data);
    return data;
  });
}

// Wyloguj — czyści sesję lokalnie i informuje Supabase
export function signOut() {
  var token = getAccessToken();
  saveSession(null);
  if (!token) return Promise.resolve();
  return fetch(SB_URL + '/auth/v1/logout', {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + token
    }
  }).catch(function() {
    // ignoruj błąd sieciowy przy wylogowaniu
  });
}

// Ponownie wczytaj sesję z localStorage — inna karta mogła w międzyczasie
// zrotować refresh_token (Supabase rotuje przy każdym użyciu i unieważnia
// stary). Trzymanie tylko kopii w pamięci prowadziło do wysyłania zużytego
// tokenu → wykrycie ponownego użycia → unieważnienie CAŁEJ rodziny tokenów
// i wylogowanie (objaw: "po chwili znowu Unauthorized / niezalogowany").
function reloadSessionFromStorage() {
  try {
    var raw = localStorage.getItem('sb_session');
    _session = raw ? JSON.parse(raw) : _session;
  } catch (e) {}
  return _session;
}

function postRefresh(refreshToken) {
  return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  .then(function(r) {
    return r.ok ? r.json() : null;
  });
}

// Pojedynczy "in-flight" refresh w obrębie karty — kilka równoczesnych wywołań
// (timer + visibilitychange + retry OAuth po 401) współdzieli jeden request,
// zamiast wysyłać ten sam refresh_token wielokrotnie.
var _refreshInFlight = null;

function runRefresh() {
  // W obrębie locka (jeśli dostępny) bierzemy NAJŚWIEŻSZY token ze storage —
  // inna karta mogła już go zrotować, wtedy po prostu go adoptujemy.
  reloadSessionFromStorage();
  if (!_session || !_session.refresh_token) return Promise.resolve(null);
  var tried = _session.refresh_token;
  return postRefresh(tried).then(function(data) {
    if (data) { saveSession(data); return data; }
    // Refresh się nie powiódł — sprawdź, czy inna karta właśnie zapisała
    // świeższą sesję; jeśli tak, adoptuj ją zamiast zabijać połączenie.
    reloadSessionFromStorage();
    if (_session && _session.refresh_token && _session.refresh_token !== tried) {
      return _session;
    }
    return null;
  });
}

// Odśwież access_token. Bezpieczny przy wielu kartach: serializuje refresh
// przez Web Locks API (gdy dostępne), zawsze czyta najnowszą sesję z
// localStorage i nie wysyła dwa razy tego samego refresh_tokena.
export function refreshSession() {
  if (_refreshInFlight) return _refreshInFlight;
  var withLock;
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    withLock = navigator.locks.request('sb_session_refresh', function() { return runRefresh(); });
  } else {
    withLock = runRefresh();
  }
  _refreshInFlight = Promise.resolve(withLock)
    .catch(function() { return null; })
    .then(function(res) { _refreshInFlight = null; return res; });
  return _refreshInFlight;
}
