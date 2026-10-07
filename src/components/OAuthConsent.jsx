// src/components/OAuthConsent.jsx
// Ekran zgody OAuth (Supabase OAuth 2.1 Server) — adres /oauth/consent?authorization_id=...
// Używany przy łączeniu zewnętrznych aplikacji (np. konektor Claude → api/mcp.js).
// Supabase przekierowuje tu użytkownika po walidacji żądania autoryzacji; my pokazujemy
// zgodę i wołamy supabase.auth.oauth.approveAuthorization / denyAuthorization.
// Ładowany leniwie (main.jsx), więc supabase-js nie trafia do głównego bundla.

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SB_URL, SB_KEY } from '../lib/supabase.js';
import { refreshSession, getSession } from '../lib/auth.js';
const ce = React.createElement;

function authorizationIdFromUrl() {
  try { return new URLSearchParams(window.location.search).get('authorization_id') || ''; }
  catch (e) { return ''; }
}

// Klient supabase-js tylko na czas tej strony: bez zapisu sesji i bez własnego
// odświeżania — sesją (i rotacją refresh_tokena) zarządza lib/auth.js.
function makeClient(session) {
  var sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    .then(function(r) { if (r.error) throw r.error; return sb; });
}

function go(url) {
  // redirect_url pochodzi z Supabase Auth (adres zarejestrowanego klienta OAuth)
  if (/^https?:\/\//i.test(url || '')) window.location.href = url;
}

var BOX = { maxWidth: 420, margin: '10vh auto 0', padding: 28, borderRadius: 14, border: '1px solid #e5e5e5', background: '#fff', fontFamily: 'Montserrat, sans-serif', textAlign: 'center' };
var BTN = { padding: '11px 22px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' };

export default function OAuthConsent() {
  var authId = authorizationIdFromUrl();
  var sd = useState(null), details = sd[0], setDetails = sd[1];
  var sc = useState(null), client = sc[0], setClient = sc[1];
  var se = useState(''), err = se[0], setErr = se[1];
  var sb = useState(false), busy = sb[0], setBusy = sb[1];

  useEffect(function() {
    if (!authId) { setErr('Brak identyfikatora autoryzacji. Spróbuj połączyć aplikację ponownie.'); return; }
    var cancelled = false;
    refreshSession()
      .then(function() {
        var s = getSession();
        if (!s || !s.access_token) throw new Error('Sesja wygasła. Zaloguj się ponownie.');
        return makeClient(s);
      })
      .then(function(sbc) {
        if (cancelled) return null;
        setClient(sbc);
        return sbc.auth.oauth.getAuthorizationDetails(authId);
      })
      .then(function(res) {
        if (!res || cancelled) return;
        if (res.error) throw res.error;
        // Użytkownik już wcześniej wyraził zgodę → od razu wracamy do aplikacji
        if (res.data && res.data.redirect_url) { go(res.data.redirect_url); return; }
        setDetails(res.data);
      })
      .catch(function(e) { if (!cancelled) setErr((e && e.message) || 'Nie udało się pobrać żądania autoryzacji.'); });
    return function() { cancelled = true; };
  }, [authId]);

  function decide(approve) {
    if (!client || busy) return;
    setBusy(true);
    var call = approve ? client.auth.oauth.approveAuthorization(authId) : client.auth.oauth.denyAuthorization(authId);
    call.then(function(res) {
      if (res.error) throw res.error;
      go(res.data && res.data.redirect_url);
    }).catch(function(e) {
      setErr((e && e.message) || 'Nie udało się zapisać decyzji.');
      setBusy(false);
    });
  }

  if (err) {
    return ce('div', { style: BOX },
      ce('div', { style: { fontSize: 15, fontWeight: 700, marginBottom: 10 } }, 'Nie można połączyć aplikacji'),
      ce('div', { style: { fontSize: 12, color: '#888', wordBreak: 'break-word' } }, err));
  }
  if (!details) {
    return ce('div', { style: BOX }, ce('div', { style: { fontSize: 13, color: '#888' } }, 'Ładowanie…'));
  }

  var name = (details.client && details.client.name) || 'Aplikacja zewnętrzna';
  return ce('div', { style: BOX },
    ce('div', { style: { fontSize: 11, color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 } }, 'Asystent Dekoracji'),
    ce('div', { style: { fontSize: 17, fontWeight: 700, marginBottom: 10 } }, 'Zezwolić aplikacji „' + name + '” na dostęp?'),
    ce('div', { style: { fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 6 } },
      'Aplikacja uzyska dostęp do Twojego konta' + (details.user && details.user.email ? ' (' + details.user.email + ')' : '') +
      ' i będzie mogła przeszukiwać Twoich klientów, wyceny i katalog.'),
    ce('div', { style: { fontSize: 11, color: '#999', marginBottom: 20 } }, 'Zgodę możesz w każdej chwili cofnąć.'),
    ce('div', { style: { display: 'flex', gap: 10, justifyContent: 'center' } },
      ce('button', { disabled: busy, onClick: function() { decide(false); }, style: Object.assign({}, BTN, { background: '#f1f1f1', color: '#333' }) }, 'Odmów'),
      ce('button', { disabled: busy, onClick: function() { decide(true); }, style: Object.assign({}, BTN, { background: '#7c3aed', color: '#fff' }) }, busy ? 'Chwila…' : 'Zezwól')));
}
