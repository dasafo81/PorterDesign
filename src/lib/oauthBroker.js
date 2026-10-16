import { SB_KEY } from './supabase.js';
import { refreshSession } from './auth.js';

function authHeaders() {
  var raw = localStorage.getItem('sb_session');
  var session = raw ? JSON.parse(raw) : null;
  return session && session.access_token
    ? { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token }
    : null;
}

// OAuth endpoints verify the application's Supabase JWT server-side.  A tab
// restored after its JWT expired previously sent that stale token straight to
// /api/oauth/start, which surfaced a raw "Unauthorized" instead of renewing
// the app session first.  Retry once with a refreshed JWT before treating the
// connection as unavailable.
function oauthFetch(path) {
  function send() {
    var headers = authHeaders();
    if (!headers) return Promise.reject(new Error('Brak sesji aplikacji'));
    return fetch(path, { method: 'POST', headers: headers });
  }
  return send().then(function(response) {
    if (response.status !== 401) return response;
    return refreshSession().then(function(session) {
      if (!session || !session.access_token) return response;
      return send();
    });
  });
}

// opts.mail: dla Google dolicza zakres Gmail (domyślnie tylko Kalendarz).
export function brokerStart(provider, opts) {
  var query = '?provider=' + encodeURIComponent(provider) + (opts && opts.mail ? '&mail=1' : '');
  return oauthFetch('/api/oauth/start' + query).then(function(r) {
    return r.json().then(function(data) {
      if (!r.ok || !data.url) throw new Error(data.error || 'Nie udało się rozpocząć połączenia');
      window.location.assign(data.url);
      return null;
    });
  });
}

// opts.mail: dla Google wybiera połączenie z Gmailem (a nie to założone dla kalendarza).
export function brokerToken(provider, opts) {
  return oauthFetch('/api/oauth/token?provider=' + encodeURIComponent(provider) + (opts && opts.mail ? '&feature=mail' : '')).then(function(r) {
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

// Połączenia zalogowanego użytkownika (bez tokenów), najnowsze pierwsze; null gdy się nie uda.
export function brokerStatus() {
  return oauthFetch('/api/oauth/status').then(function(r) {
    return r.ok ? r.json().then(function(d) { return d.connections || []; }) : null;
  }).catch(function() { return null; });
}

// Usuwa zapisane połączenie (i unieważnia token u dostawcy, jeśli ten to wspiera).
export function brokerDisconnect(provider, opts) {
  return oauthFetch('/api/oauth/disconnect?provider=' + encodeURIComponent(provider) + (opts && opts.mail ? '&feature=mail' : '')).then(function(r) {
    if (!r.ok) throw new Error('Nie udało się odłączyć konta');
  });
}

export function brokerTokenRetry(provider, attempts, opts) {
  var left = attempts == null ? 3 : attempts;
  return brokerToken(provider, opts).catch(function(e) {
    if (left <= 1 || !e || e.code !== 'OAUTH_RECONNECT_REQUIRED') throw e;
    return new Promise(function(resolve) { setTimeout(resolve, 500); })
      .then(function() { return brokerTokenRetry(provider, left - 1, opts); });
  });
}

export function markBrokerCallback() {
  var params = new URLSearchParams(window.location.search);
  var provider = params.get('oauth');
  if (provider && params.get('connected') === '1') {
    localStorage.setItem('pd_oauth_' + provider, '1');
    sessionStorage.setItem('pd_oauth_connected_' + provider, '1');
    // Zapamiętaj, do której zakładki wrócić po połączeniu OAuth. Query string
    // jest zaraz czyszczony (replaceState), więc routing po powrocie nie może
    // na nim polegać — wcześniej Google lądował na ekranie startowym.
    // Google z zakresem Gmail wraca do Poczty ('gmail'), sam Kalendarz — do kalendarza.
    sessionStorage.setItem('pd_oauth_landing', provider === 'google' && params.get('return') === 'mail' ? 'gmail' : provider);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }
}

export function consumeBrokerCallback(provider) {
  var key = 'pd_oauth_connected_' + provider;
  if (sessionStorage.getItem(key) !== '1') return false;
  sessionStorage.removeItem(key);
  return true;
}
