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

// Odśwież token (wywołuj co ~50 minut żeby sesja nie wygasła)
export function refreshSession() {
  if (!_session || !_session.refresh_token) return Promise.resolve(null);
  return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: _session.refresh_token })
  })
  .then(function(r) {
    return r.ok ? r.json() : null;
  })
  .then(function(data) {
    if (data) saveSession(data);
    return data;
  })
  .catch(function() {
    return null;
  });
}
