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

// ── Ochrona przed crashem po deployu ──
// Ekrany ladowane leniwie (Mail, Faktury, Magazyn...) maja pliki z hashem w nazwie.
// Po kazdym deployu stare pliki znikaja z Vercela, a karta otwarta od rana
// (np. PWA na iPadzie) probuje pobrac nieistniejacy chunk -> caly React sie
// odmontowuje -> bialy ekran. Wykrywamy ten blad i przeladowujemy strone raz.
function isChunkError(err){
  var m=String((err&&(err.message||err))||"");
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Unable to preload CSS/i.test(m);
}
function reloadOnce(){
  // Blokada petli: max 1 automatyczne przeladowanie na 30 s.
  try{
    var last=+sessionStorage.getItem("pd_chunk_reload")||0;
    if(Date.now()-last<30000) return false;
    sessionStorage.setItem("pd_chunk_reload",String(Date.now()));
  }catch(e){}
  window.location.reload();
  return true;
}
window.addEventListener("vite:preloadError",function(ev){
  if(reloadOnce()&&ev&&ev.preventDefault) ev.preventDefault();
});

// Zamiast bialego ekranu: automatyczne przeladowanie (blad chunku)
// albo komunikat z przyciskiem odswiezenia (kazdy inny blad renderu).
class AppErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err:err}; }
  componentDidCatch(err,info){
    if(isChunkError(err)&&reloadOnce()) return;
    try{ if(SENTRY_DSN) Sentry.captureException(err,{extra:{componentStack:info&&info.componentStack}}); }catch(e){}
    console.error("[AppErrorBoundary]",err);
  }
  render(){
    if(!this.state.err) return this.props.children;
    var ce=React.createElement;
    return ce("div",{style:{minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:24,textAlign:"center",fontFamily:"Montserrat, sans-serif"}},
      ce("div",{style:{fontSize:15,fontWeight:700}},"Co\u015b posz\u0142o nie tak"),
      ce("div",{style:{fontSize:12,color:"#888",maxWidth:360}},"Dane zapisane w bazie s\u0105 bezpieczne. Od\u015bwie\u017c aplikacj\u0119, aby kontynuowa\u0107."),
      ce("button",{onClick:function(){window.location.reload();},style:{padding:"10px 22px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}},"Od\u015bwie\u017c aplikacj\u0119")
    );
  }
}

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

  return React.createElement(AppErrorBoundary, null,
    React.createElement(App, {
      onLogout: function() { setLoggedIn(false); }
    })
  );
}

ReactDOM.createRoot(document.getElementById('app-mount')).render(
  React.createElement(Root)
);
