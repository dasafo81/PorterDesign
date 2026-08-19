import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';
import { App } from './App.jsx';
import { ScreenLogin } from './components/ScreenLogin.jsx';
import { loadSession, refreshSession } from './lib/auth.js';
import { markBrokerCallback } from './lib/oauthBroker.js';

var SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE === 'production' ? 'production' : 'preview',
    integrations: [],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: function(event) {
      // Never send auth tokens, invoice contents, email bodies or KSeF credentials.
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      if (event.user) {
        event.user = { id: event.user.id };
      }
      return event;
    }
  });
}

markBrokerCallback();

function Root() {
  var initial = loadSession();
  var ss = useState(!!initial); var loggedIn = ss[0]; var setLoggedIn = ss[1];

  // Odśwież access_token co 30 min — Supabase token wygasa po ~1h.
  // Przy refresh_token grant Supabase regeneruje JWT z aktualnym app_metadata,
  // więc tenant_id automatycznie wjedzie do tokenu po Phase 2.
  useEffect(function(){
    if(!loggedIn)return;
    // Sesja przywrócona z localStorage może mieć wygasły JWT po zamknięciu
    // karty. Odśwież ją od razu, zanim moduł Google Calendar wywoła OAuth.
    refreshSession();
    var timer=setInterval(function(){refreshSession();},30*60*1000);
    // setInterval bywa spowalniany/wstrzymywany w kartach w tle, więc token
    // mógł wygasnąć zanim ktoś wrócił do karty — odśwież też przy powrocie.
    function onVisible(){ if(document.visibilityState==="visible") refreshSession(); }
    document.addEventListener("visibilitychange", onVisible);
    return function(){
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  },[loggedIn]);

  if (!loggedIn) {
    return React.createElement(ScreenLogin, {
      onLogin: function() { setLoggedIn(true); }
    });
  }

  return React.createElement(App, {
    onLogout: function() { setLoggedIn(false); }
  });
}

ReactDOM.createRoot(document.getElementById('app-mount')).render(
  React.createElement(Root)
);
