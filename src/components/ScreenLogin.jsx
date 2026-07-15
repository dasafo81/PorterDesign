// src/components/ScreenLogin.jsx
import React, { useState } from 'react';
import { signIn } from '../lib/auth.js';
import { LOGO_SRC } from '../constants/data.js';
const ce = React.createElement;

// Mini-lista funkcji pokazywana obok logowania — treść zsynchronizowana z landing.html
var LOGIN_FEATURES = [
  { icon: '\uD83D\uDCCB', label: 'Wyceny w kilka minut' },
  { icon: '\uD83D\uDCC8', label: 'CRM z tablic\u0105 Kanban' },
  { icon: '\uD83E\uDDFE', label: 'Faktury zgodne z KSeF' },
  { icon: '\uD83D\uDCE6', label: 'Magazyn i zam\u00f3wienia tkanin' }
];

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

  var disabled = loading || !email.trim() || !pass.trim();

  var INP = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 15,
    boxSizing: 'border-box',
    display: 'block',
    minHeight: 52,
    color: 'var(--t1)',
    fontFamily: 'inherit'
  };

  return ce('div', {
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }
  },
    // Media query dla dwukolumnowego shellu — jedyny fragment wymagający prawdziwego CSS
    ce('style', { dangerouslySetInnerHTML: { __html:
      '.pdlogin-shell{display:flex;width:min(920px,100%);border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.28);}' +
      '.pdlogin-hero{flex:1 1 46%;min-width:0;padding:2.6rem 2.4rem;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;}' +
      '.pdlogin-form{flex:1 1 54%;min-width:0;background:var(--bg2);padding:2.8rem 2.4rem;display:flex;flex-direction:column;justify-content:center;}' +
      '@media (max-width:820px){' +
        '.pdlogin-shell{flex-direction:column;width:min(440px,100%);}' +
        '.pdlogin-hero{padding:2rem 1.8rem 1.6rem;}' +
        '.pdlogin-form{padding:2rem 1.8rem;}' +
      '}'
    } }),

    ce('div', { className: 'pdlogin-shell' },

      // ── Lewa kolumna: hero gradientowy, spójny z home-screenem appki ──
      ce('div', { className: 'hero-banner pdlogin-hero' },
        ce('div', { className: 'holo-orb', style: { width: 130, height: 130, background: 'var(--orb-1)', top: -30, right: -20, animationDelay: '0s' } }),
        ce('div', { className: 'holo-orb', style: { width: 90, height: 90, background: 'var(--orb-2)', bottom: -10, left: 40, animationDelay: '2.5s' } }),
        ce('div', { className: 'holo-orb', style: { width: 60, height: 60, background: 'var(--orb-3)', top: 30, left: 200, animationDelay: '1.5s' } }),

        ce('div', { style: { position: 'relative', zIndex: 1 } },
          // Logo w szklanym chipie — czytelne niezależnie od kolorów samego logo
          ce('div', {
            style: {
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 16, padding: '10px 16px', marginBottom: '1.6rem'
            }
          },
            ce('img', { src: LOGO_SRC, alt: 'Porter Design', style: { height: 34, objectFit: 'contain' } })
          ),

          ce('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--hero-text-1)', marginBottom: 10 } },
            'Asystent Dekoracji'
          ),
          ce('div', { style: { fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1.18, marginBottom: 12 } },
            'Wycena, CRM i faktury.', ce('br'), 'W jednym miejscu.'
          ),
          ce('div', { style: { fontSize: 14, color: 'var(--hero-text-2)', lineHeight: 1.6, marginBottom: '1.6rem', maxWidth: 380 } },
            'Kompletne studio dekoracji okien — od pomiaru po fakturę zgodną z KSeF, bez przełączania się między programami.'
          ),

          // Mini-lista funkcji
          ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 } },
            LOGIN_FEATURES.map(function(f, i) {
              return ce('div', {
                key: i,
                style: {
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.20)', borderRadius: 12,
                  padding: '10px 12px', fontSize: 12, color: 'var(--hero-text-2)', fontWeight: 600
                }
              },
                ce('span', { style: { fontSize: 15, flexShrink: 0 } }, f.icon),
                ce('span', null, f.label)
              );
            })
          )
        )
      ),

      // ── Prawa kolumna: formularz logowania (logika bez zmian) ──
      ce('div', { className: 'pdlogin-form' },

        ce('div', {
          style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '1.6rem' }
        }, 'Logowanie do aplikacji'),

        // E-mail
        ce('div', { style: { marginBottom: 10 } },
          ce('input', {
            type: 'email',
            className: 'input-glass',
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
            className: 'input-glass',
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
            color: 'var(--red)',
            fontSize: 13,
            marginBottom: 12,
            padding: '10px 14px',
            background: 'var(--red-l)',
            border: '1px solid var(--red-border)',
            borderRadius: 8,
            lineHeight: 1.4
          }
        }, err) : null,

        // Przycisk logowania
        ce('button', {
          className: 'btn-primary',
          onClick: handleSubmit,
          disabled: disabled,
          style: {
            width: '100%',
            padding: '15px',
            fontSize: 13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            minHeight: 52,
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer'
          }
        }, loading ? 'Logowanie\u2026' : 'Zaloguj si\u0119'),

        // Link do rejestracji — dla nowych klient\u00f3w bez konta
        ce('div', { style: { marginTop: 14, fontSize: 12, textAlign: 'center', color: 'var(--t3)' } },
          'Nie masz jeszcze konta? ',
          ce('a', { href: '/register', style: { color: 'var(--violet)', fontWeight: 700, textDecoration: 'none' } }, 'Za\u0142\u00f3\u017c konto (3 dni za darmo)')
        ),

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
    )
  );
}
