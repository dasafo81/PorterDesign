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

  // Odświeżaj access_token PROAKTYWNIE — na ~60s przed jego wygaśnięciem,
  // niezależnie od ustawionego czasu życia JWT (mógł być krótszy niż stały
  // 30-min interwał, przez co token wygasał w trakcie pracy → "po chwili
  // znowu niezalogowany"). Po każdym refreshu przeliczamy termin z claim `exp`.
  useEffect(function(){
    if(!loggedIn)return;
    var timer=null;
    function tokenExpMs(){
      try{
        var raw=localStorage.getItem("sb_session");
        var s=raw?JSON.parse(raw):null;
        if(s&&s.access_token){
          var payload=JSON.parse(atob(s.access_token.split(".")[1]));
          if(payload&&payload.exp) return payload.exp*1000;
        }
      }catch(e){}
      return 0;
    }
    function schedule(){
      if(timer){clearTimeout(timer);timer=null;}
      var exp=tokenExpMs();
      // 60s zapasu przed wygaśnięciem; jeśli brak/expired — odśwież niebawem.
      var delay=exp?Math.max(10000, exp-Date.now()-60000):15000;
      timer=setTimeout(function(){ refreshSession().then(schedule); }, delay);
    }
    // Sesja przywrócona z localStorage może mieć wygasły JWT po zamknięciu
    // karty. Odśwież ją od razu, zanim moduł Google Calendar wywoła OAuth.
    refreshSession().then(schedule);
    // Karty w tle usypiają timery, więc odśwież też po powrocie do karty.
    // refreshSession() jest teraz "single-flight" + zabezpieczony Web Locks,
    // więc równoczesne wywołania nie unieważnią sesji.
    function onVisible(){ if(document.visibilityState==="visible") refreshSession().then(schedule); }
    document.addEventListener("visibilitychange", onVisible);
    return function(){
      if(timer)clearTimeout(timer);
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
