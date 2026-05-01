// src/components/ScreenLogin.jsx
import React, { useState } from 'react';
import { signIn } from '../lib/auth.js';
import { LOGO_SRC } from '../constants/data.js';
const ce = React.createElement;

export function ScreenLogin(p) {
  // p.onLogin(session) — wywoływane po udanym logowaniu
  var se = useState(''), email = se[0], setEmail = se[1];
  var sp = useState(''), pass = sp[0], setPass = sp[1];
  var sl = useState(false), loading = sl[0], setLoading = sl[1];
  var serr = useState(''), err = serr[0], setErr = serr[1];
  var sshow = useState(false), showPass = sshow[0], setShowPass = sshow[1];

  function handleSubmit() {
    if (!email.trim() || !pass.trim()) return;
    setLoading(true);
    setErr('');
    signIn(email.trim(), pass.trim())
      .then(function(session) {
        p.onLogin(session);
      })
      .catch(function(e) {
        setErr(e.message || 'Nieprawidłowy e-mail lub hasło');
        setLoading(false);
      });
  }

  var INP = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 15,
    border: '1.5px solid var(--bd2)',
    borderRadius: 10,
    background: 'var(--bg)',
    color: 'var(--t1)',
    boxSizing: 'border-box',
    display: 'block',
    minHeight: 52,
    outline: 'none',
    fontFamily: 'inherit'
  };

  return ce('div', {
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 24
    }
  },
    ce('div', {
      style: {
        width: 'min(380px, 100%)',
        background: 'var(--bg2)',
        borderRadius: 20,
        padding: '2.5rem 2rem 2rem',
        border: '1px solid var(--bd2)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
      }
    },

      // Logo
      ce('div', { style: { textAlign: 'center', marginBottom: '2rem' } },
        ce('img', {
          src: LOGO_SRC,
          alt: 'Porter Design',
          style: { height: 44, objectFit: 'contain' }
        })
      ),

      // Nagłówek
      ce('div', {
        style: {
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }
      }, 'Logowanie do aplikacji'),

      // E-mail
      ce('div', { style: { marginBottom: 10 } },
        ce('input', {
          type: 'email',
          value: email,
          autoFocus: true,
          autoComplete: 'email',
          placeholder: 'Adres e-mail',
          onChange: function(ev) { setEmail(ev.target.value); setErr(''); },
          onKeyDown: function(ev) { if (ev.key === 'Enter') handleSubmit(); },
          style: INP
        })
      ),

      // Hasło z przyciskiem pokaż/ukryj
      ce('div', { style: { marginBottom: 14, position: 'relative' } },
        ce('input', {
          type: showPass ? 'text' : 'password',
          value: pass,
          autoComplete: 'current-password',
          placeholder: 'Has\u0142o',
          onChange: function(ev) { setPass(ev.target.value); setErr(''); },
          onKeyDown: function(ev) { if (ev.key === 'Enter') handleSubmit(); },
          style: Object.assign({}, INP, { paddingRight: 48 })
        }),
        ce('button', {
          onClick: function() { setShowPass(function(v) { return !v; }); },
          tabIndex: -1,
          style: {
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t3)',
            fontSize: 16,
            padding: '4px',
            lineHeight: 1
          }
        }, showPass ? '\uD83D\uDE48' : '\uD83D\uDC41\uFE0F')
      ),

      // Błąd
      err ? ce('div', {
        style: {
          color: '#ef4444',
          fontSize: 13,
          marginBottom: 12,
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8,
          lineHeight: 1.4
        }
      }, err) : null,

      // Przycisk logowania
      ce('button', {
        onClick: handleSubmit,
        disabled: loading || !email.trim() || !pass.trim(),
        style: {
          width: '100%',
          padding: '15px',
          borderRadius: 10,
          border: 'none',
          background: (loading || !email.trim() || !pass.trim()) ? 'var(--bd2)' : 'var(--t1)',
          color: (loading || !email.trim() || !pass.trim()) ? 'var(--t3)' : 'var(--bg)',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          cursor: (loading || !email.trim() || !pass.trim()) ? 'not-allowed' : 'pointer',
          textTransform: 'uppercase',
          transition: 'all .15s',
          minHeight: 52
        }
      }, loading ? 'Logowanie\u2026' : 'Zaloguj si\u0119'),

      // Stopka
      ce('div', {
        style: {
          marginTop: '1.5rem',
          fontSize: 11,
          color: 'var(--t3)',
          textAlign: 'center',
          letterSpacing: '0.04em'
        }
      }, 'Porter Design Assistant \u00B7 Dost\u0119p tylko dla uprawnionych u\u017Cytkownik\u00F3w')
    )
  );
}
