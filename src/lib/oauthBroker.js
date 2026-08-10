import { SB_KEY } from './supabase.js';

function authHeaders() {
  var raw = localStorage.getItem('sb_session');
  var session = raw ? JSON.parse(raw) : null;
  return session && session.access_token
    ? { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token }
    : null;
}

export function brokerStart(provider) {
  var headers = authHeaders();
  if (!headers) return Promise.reject(new Error('Brak sesji aplikacji'));
  return fetch('/api/oauth/start?provider=' + encodeURIComponent(provider), {
    method: 'POST', headers: headers
  }).then(function(r) {
    return r.json().then(function(data) {
      if (!r.ok || !data.url) throw new Error(data.error || 'Nie udało się rozpocząć połączenia');
      window.location.assign(data.url);
      return null;
    });
  });
}

export function brokerToken(provider) {
  var headers = authHeaders();
  if (!headers) return Promise.reject(new Error('Brak sesji aplikacji'));
  return fetch('/api/oauth/token?provider=' + encodeURIComponent(provider), {
    method: 'POST', headers: headers
  }).then(function(r) {
    return r.json().then(function(data) {
      if (!r.ok || !data.access_token) {
        var e = new Error(data.error || 'OAUTH_RECONNECT_REQUIRED');
        e.code = data.error;
        throw e;
      }
      return data;
    });
  });
}

export function markBrokerCallback() {
  var params = new URLSearchParams(window.location.search);
  var provider = params.get('oauth');
  if (provider && params.get('connected') === '1') {
    localStorage.setItem('pd_oauth_' + provider, '1');
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }
}
