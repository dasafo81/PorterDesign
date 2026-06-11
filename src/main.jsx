import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App.jsx';
import { ScreenLogin } from './components/ScreenLogin.jsx';
import { loadSession, refreshSession } from './lib/auth.js';

function Root() {
  var initial = loadSession();
  var ss = useState(!!initial); var loggedIn = ss[0]; var setLoggedIn = ss[1];

  // Odśwież access_token co 30 min — Supabase token wygasa po ~1h.
  // Przy refresh_token grant Supabase regeneruje JWT z aktualnym app_metadata,
  // więc tenant_id automatycznie wjedzie do tokenu po Phase 2.
  useEffect(function(){
    if(!loggedIn)return;
    var timer=setInterval(function(){refreshSession();},30*60*1000);
    return function(){clearInterval(timer);};
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
