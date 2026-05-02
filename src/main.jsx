import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App.jsx';
import { ScreenLogin } from './components/ScreenLogin.jsx';
import { loadSession } from './lib/auth.js';

function Root() {
  var initial = loadSession();
  var ss = useState(!!initial); var loggedIn = ss[0]; var setLoggedIn = ss[1];

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
