import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/supabase.js';
const ce = React.createElement;

// ── Style helpers ──────────────────────────────────────────────────────────
var inputStyle = {
  width: '100%', padding: '11px 14px', fontSize: 14,
  border: '1.5px solid var(--bd2)', borderRadius: 9,
  background: 'var(--bg)', color: 'var(--t1)',
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit'
};
var secondaryButtonStyle = {
  border: '1px solid var(--bd2)', background: 'var(--bg)', color: 'var(--t2)',
  borderRadius: 9, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500
};
function primaryButtonStyle(disabled) {
  return {
    border: 'none',
    background: disabled ? 'var(--bd2)' : 'var(--violet)',
    color: disabled ? 'var(--t3)' : '#fff',
    borderRadius: 9, padding: '9px 18px', fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, letterSpacing: '0.04em'
  };
}
var thStyle = {
  textAlign: 'left', padding: '8px 6px', fontSize: 11,
  color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 700
};

// ── Modal shell ────────────────────────────────────────────────────────────
function ModalShell(p) {
  return ce('div', {
    onClick: function(e) { if (e.target === e.currentTarget) p.onClose(); },
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             zIndex: 10000, padding: 20 }
  },
    ce('div', { style: { background: 'var(--bg)', borderRadius: 16, padding: 24,
                          width: 'min(440px, 100%)', border: '1px solid var(--bd2)',
                          boxShadow: '0 20px 60px rgba(0,0,0,0.3)' } },
      ce('div', { style: { fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 18 } }, p.title),
      p.children
    )
  );
}

// ── Create-tenant modal ────────────────────────────────────────────────────
function CreateTenantModal(p) {
  var sName = useState(''), name = sName[0], setName = sName[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];

  function submit() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    adminApi.createTenant(name.trim()).then(function() {
      p.onCreated();
    }).catch(function(e) {
      setErr(e.message || 'Blad tworzenia tenanta');
      setBusy(false);
    });
  }

  return ce(ModalShell, { title: 'Nowy tenant', onClose: p.onClose },
    err ? ce('div', { style: { padding: 10, marginBottom: 12, background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                                color: '#ef4444', fontSize: 13 } }, err) : null,
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6 } }, 'Nazwa firmy'),
    ce('input', {
      autoFocus: true, value: name,
      onChange: function(e) { setName(e.target.value); },
      onKeyDown: function(e) { if (e.key === 'Enter') submit(); },
      placeholder: 'np. Window Studio Pro',
      style: inputStyle
    }),
    ce('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
      ce('button', { onClick: p.onClose, disabled: busy, style: secondaryButtonStyle }, 'Anuluj'),
      ce('button', { onClick: submit, disabled: busy || !name.trim(),
                     style: primaryButtonStyle(busy || !name.trim()) },
        busy ? 'Tworze...' : 'Utworz')
    )
  );
}

// ── Logo: plik -> zmniejszony data URL (zapisywany w config.logo_url; dziala w app, PDF i mailach) ──
function fileToLogoDataUrl(file) {
  return new Promise(function(resolve, reject) {
    if (!/^image\//.test(file.type)) { reject(new Error('Wybierz plik graficzny (PNG, JPG, WEBP lub SVG).')); return; }
    var reader = new FileReader();
    reader.onerror = function() { reject(new Error('Nie udało się odczytać pliku.')); };
    reader.onload = function() {
      var src = reader.result;
      if (file.type === 'image/svg+xml') {
        if (src.length > 300000) reject(new Error('Plik SVG jest za duży (max ok. 200 KB).')); else resolve(src);
        return;
      }
      var img = new Image();
      img.onerror = function() { reject(new Error('Nie udało się wczytać obrazu.')); };
      img.onload = function() {
        var MAX_W = 600, MAX_H = 300;
        var k = Math.min(1, MAX_W / img.width, MAX_H / img.height);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png')); // PNG zachowuje przezroczystość
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

var labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 6 };
function Field(p) {
  return ce('div', { style: p.style || {} },
    ce('label', { style: labelStyle }, p.label),
    p.children,
    p.hint ? ce('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 5, lineHeight: 1.4 } }, p.hint) : null);
}
function Section(p) {
  return ce('div', { style: { background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 12, padding: 18 } },
    ce('div', { style: { fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 } }, p.title),
    p.sub ? ce('div', { style: { fontSize: 12, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.5 } }, p.sub) : ce('div', { style: { height: 12 } }),
    p.children);
}

// ── Edit-tenant (branding + dane firmy) modal ─────────────────
function EditTenantModal(p) {
  var cfg = p.tenant.config || {};
  var sel = cfg.seller || {};
  var sBrand = useState(cfg.brand_name || ''), brandName = sBrand[0], setBrandName = sBrand[1];
  var sLogo = useState(cfg.logo_url || ''), logoUrl = sLogo[0], setLogoUrl = sLogo[1];
  var sLogoErr = useState(null), logoErr = sLogoErr[0], setLogoErr = sLogoErr[1];
  var SELLER_KEYS = ['name', 'short_name', 'addr', 'city', 'nip', 'email', 'tel', 'bank', 'bank_name', 'signature'];
  var sSel = useState(function() { var o = {}; SELLER_KEYS.forEach(function(k) { o[k] = sel[k] || ''; }); return o; }), seller = sSel[0], setSeller = sSel[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];
  var fileRef = React.useRef(null);

  function setS(k, v) { setSeller(function(s) { var n = Object.assign({}, s); n[k] = v; return n; }); }
  function bind(k) { return { value: seller[k], onChange: function(e) { setS(k, e.target.value); }, style: inputStyle }; }

  function onPickLogo(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setLogoErr(null);
    fileToLogoDataUrl(f).then(setLogoUrl).catch(function(ex) { setLogoErr(ex.message); });
  }

  function submit() {
    setBusy(true); setErr(null);
    var sOut = {};
    SELLER_KEYS.forEach(function(k) { if (seller[k].trim()) sOut[k] = seller[k].trim(); });
    // Merge z dotychczasowa konfiguracja — PATCH podmienia caly config, a trzyma on tez np. builtin_catalog.
    adminApi.updateTenant(p.tenant.id, Object.assign({}, cfg, {
      brand_name: brandName.trim(),
      logo_url: logoUrl.trim(),
      seller: sOut
    })).then(function() {
      p.onSaved();
    }).catch(function(e) {
      setErr(e.message || 'Blad zapisu');
      setBusy(false);
    });
  }

  var twoCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 };
  return ce('div', {
    onClick: function(e) { if (e.target === e.currentTarget && !busy) p.onClose(); },
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
             alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }
  },
    ce('div', { style: { background: 'var(--bg)', borderRadius: 16, width: 'min(1040px, 100%)', maxHeight: 'calc(100vh - 40px)',
                          display: 'flex', flexDirection: 'column', border: '1px solid var(--bd2)',
                          boxShadow: '0 20px 60px rgba(0,0,0,0.3)' } },
      // nagłówek
      ce('div', { style: { padding: '18px 24px', borderBottom: '1px solid var(--bd2)', display: 'flex', alignItems: 'baseline', gap: 10 } },
        ce('div', { style: { fontSize: 17, fontWeight: 700, color: 'var(--t1)' } }, 'Branding i dane firmy'),
        ce('div', { style: { fontSize: 13, color: 'var(--t3)' } }, p.tenant.name)),
      // treść (przewijana)
      ce('div', { style: { padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 } },
        err ? ce('div', { style: { padding: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: 8, color: '#ef4444', fontSize: 13 } }, err) : null,

        ce(Section, { title: 'Marka', sub: 'Nazwa i logo w aplikacji (pasek boczny, ekran główny) oraz w PDF-ach. Puste pola — nazwa tenanta, bez logo.' },
          ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' } },
            ce(Field, { label: 'Nazwa marki (topbar)' },
              ce('input', { autoFocus: true, value: brandName, onChange: function(e) { setBrandName(e.target.value); },
                            placeholder: 'np. Window Studio Pro', style: inputStyle })),
            ce(Field, { label: 'Logo' },
              ce('div', { style: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' } },
                ce('div', { style: { width: 150, height: 76, border: '1.5px dashed var(--bd2)', borderRadius: 10, background: 'var(--bg2)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 } },
                  logoUrl
                    ? ce('img', { src: logoUrl, alt: 'Logo', style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } })
                    : ce('span', { style: { fontSize: 12, color: 'var(--t3)' } }, 'brak logo')),
                ce('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                  ce('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', onChange: onPickLogo, style: { display: 'none' } }),
                  ce('button', { type: 'button', onClick: function() { if (fileRef.current) fileRef.current.click(); }, style: secondaryButtonStyle },
                    logoUrl ? '📁 Zmień logo…' : '📁 Wybierz plik…'),
                  logoUrl ? ce('button', { type: 'button', onClick: function() { setLogoUrl(''); setLogoErr(null); },
                    style: Object.assign({}, secondaryButtonStyle, { color: '#dc2626' }) }, 'Usuń logo') : null)),
              logoErr ? ce('div', { style: { fontSize: 12, color: '#ef4444', marginTop: 8 } }, logoErr) : null,
              ce('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 8 } }, 'PNG, JPG, WEBP lub SVG — zostanie automatycznie zmniejszone. Najlepiej logo na przezroczystym tle.'),
              ce('input', { value: logoUrl.indexOf('data:') === 0 ? '' : logoUrl, onChange: function(e) { setLogoUrl(e.target.value); },
                            placeholder: 'albo wklej adres URL logo: https://...', style: Object.assign({}, inputStyle, { marginTop: 10, fontSize: 13 }) })))),

        ce(Section, { title: 'Dane firmy', sub: 'Trafiają do PDF-ów wycen i zamówień oraz podpisów w mailach.' },
          ce('div', { style: twoCol },
            ce(Field, { label: 'Pełna nazwa firmy (PDF, faktury)' }, ce('input', bind('name'))),
            ce(Field, { label: 'Nazwa skrócona' }, ce('input', bind('short_name'))),
            ce(Field, { label: 'Adres' }, ce('input', bind('addr'))),
            ce(Field, { label: 'Kod i miasto' }, ce('input', bind('city'))),
            ce(Field, { label: 'NIP' }, ce('input', bind('nip'))),
            ce(Field, { label: 'Telefon' }, ce('input', bind('tel'))),
            ce(Field, { label: 'E-mail firmowy' }, ce('input', bind('email'))))),

        ce('div', { style: twoCol },
          ce(Section, { title: 'Konto bankowe', sub: 'Wyświetlane na dokumentach do zapłaty.' },
            ce('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
              ce(Field, { label: 'Nr konta' }, ce('input', bind('bank'))),
              ce(Field, { label: 'Nazwa banku' }, ce('input', bind('bank_name'))))),
          ce(Section, { title: 'Podpis w mailach', sub: 'Dodawany na końcu wiadomości (możesz użyć wielu linii).' },
            ce('textarea', { rows: 5, value: seller.signature, onChange: function(e) { setS('signature', e.target.value); },
                              placeholder: 'Imię i nazwisko\nNazwa firmy', style: Object.assign({}, inputStyle, { resize: 'vertical' }) })))
      ),
      // stopka z przyciskami (zawsze widoczna)
      ce('div', { style: { padding: '14px 24px', borderTop: '1px solid var(--bd2)', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        ce('button', { onClick: p.onClose, disabled: busy, style: secondaryButtonStyle }, 'Anuluj'),
        ce('button', { onClick: submit, disabled: busy, style: primaryButtonStyle(busy) }, busy ? 'Zapisuje...' : 'Zapisz'))
    )
  );
}

// ── Delete-tenant modal (nieodwracalne) ───────────────────────
function DeleteTenantModal(p) {
  var sConf = useState(''), conf = sConf[0], setConf = sConf[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];
  var t = p.tenant;
  var match = conf.trim() === (t.name || '').trim();

  function submit() {
    if (!match) return;
    setBusy(true); setErr(null);
    adminApi.deleteTenant(t.id, conf.trim()).then(function(res) {
      p.onDeleted(res);
    }).catch(function(e) {
      setErr(e.message || 'Blad usuwania');
      setBusy(false);
    });
  }

  return ce(ModalShell, { title: 'Usu\u0144 tenanta \u2014 ' + t.name, onClose: busy ? function() {} : p.onClose },
    err ? ce('div', { style: { padding: 10, marginBottom: 12, background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                                color: '#ef4444', fontSize: 13 } }, err) : null,
    ce('div', { style: { fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 12 } },
      'Operacja jest ', ce('strong', null, 'nieodwracalna'), '. Zostan\u0105 trwale usuni\u0119te: ',
      ce('strong', null, (t.user_count || 0) + ' kont u\u017cytkownik\u00f3w'), ', ',
      ce('strong', null, (t.client_count || 0) + ' klient\u00f3w'),
      ' oraz wszystkie pozosta\u0142e dane tenanta (wyceny, faktury, katalog, zadania, kontrahenci, ustawienia). ',
      'Nie s\u0105 usuwane pliki w Storage ani subskrypcja w Stripe. Przywr\u00f3ci\u0107 mo\u017cna tylko z kopii zapasowej bazy.'),
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                            color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 6 } },
      'Wpisz nazwę tenanta, aby potwierdzić: ' + t.name),
    ce('input', {
      autoFocus: true, value: conf,
      onChange: function(e) { setConf(e.target.value); },
      onKeyDown: function(e) { if (e.key === 'Enter') submit(); },
      placeholder: t.name, style: inputStyle
    }),
    ce('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
      ce('button', { onClick: p.onClose, disabled: busy, style: secondaryButtonStyle }, 'Anuluj'),
      ce('button', { onClick: submit, disabled: busy || !match,
        style: { border: 'none', background: '#dc2626', color: '#fff', borderRadius: 10, padding: '10px 18px',
                  fontSize: 13, fontWeight: 700, cursor: (busy || !match) ? 'not-allowed' : 'pointer',
                  opacity: (busy || !match) ? 0.5 : 1 } },
        busy ? 'Usuwam...' : 'Usu\u0144 trwale'))
  );
}

// ── Awatary userow (kolor + inicjaly) — do przypisywania dealow w CRM ────────
var USER_COLORS = ['#6366f1', '#db2777', '#059669', '#d97706', '#0ea5e9', '#8b5cf6', '#dc2626', '#0d9488'];
function userInitials(name, email) {
  var n = (name || '').trim();
  if (n) {
    var parts = n.split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : n[0].toUpperCase();
  }
  return ((email || '?')[0] || '?').toUpperCase();
}
function UserAvatar(p) {
  var size = p.size || 26;
  return ce('div', { style: { width: size, height: size, borderRadius: '50%',
                                background: p.color || 'var(--t3)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: size * 0.42, fontWeight: 700, color: '#fff',
                                flexShrink: 0, userSelect: 'none' } },
    userInitials(p.name, p.email));
}
function ColorPicker(p) {
  return ce('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } },
    USER_COLORS.map(function(c) {
      return ce('div', {
        key: c, onClick: function() { p.onChange(c); },
        style: { width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: p.value === c ? '2.5px solid var(--t1)' : '2.5px solid transparent',
                  boxSizing: 'border-box' }
      });
    })
  );
}

// ── Create-user modal ─────────────────────────────────────────
function CreateUserModal(p) {
  var sEmail = useState(''), email = sEmail[0], setEmail = sEmail[1];
  var sPass = useState(''), pass = sPass[0], setPass = sPass[1];
  var sName = useState(''), displayName = sName[0], setDisplayName = sName[1];
  var sColor = useState(USER_COLORS[0]), color = sColor[0], setColor = sColor[1];
  var sIsAdmin = useState(false), isAdmin = sIsAdmin[0], setIsAdmin = sIsAdmin[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];

  function submit() {
    if (!email.trim() || !pass) return;
    if (pass.length < 8) { setErr('Haslo musi miec min. 8 znakow'); return; }
    setBusy(true); setErr(null);
    adminApi.createUser({
      email: email.trim().toLowerCase(),
      password: pass,
      tenant_id: p.tenant.id,
      is_tenant_admin: isAdmin,
      display_name: displayName.trim(),
      color: color
    }).then(function() {
      p.onCreated();
    }).catch(function(e) {
      setErr(e.message || 'Blad tworzenia usera');
      setBusy(false);
    });
  }

  return ce(ModalShell, { title: 'Nowy user \u2014 ' + p.tenant.name, onClose: p.onClose },
    err ? ce('div', { style: { padding: 10, marginBottom: 12, background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                                color: '#ef4444', fontSize: 13 } }, err) : null,
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6 } }, 'Email'),
    ce('input', {
      autoFocus: true, type: 'email', value: email,
      onChange: function(e) { setEmail(e.target.value); },
      placeholder: 'user@firma.pl',
      style: inputStyle
    }),
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6, marginTop: 14 } },
      'Imie (widoczne jako awatar w CRM)'),
    ce('input', {
      type: 'text', value: displayName,
      onChange: function(e) { setDisplayName(e.target.value); },
      placeholder: 'np. Paulina',
      style: inputStyle
    }),
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6, marginTop: 14 } },
      'Kolor awatara'),
    ce(ColorPicker, { value: color, onChange: setColor }),
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6, marginTop: 14 } },
      'Haslo poczatkowe (min. 8 znakow)'),
    ce('input', {
      type: 'text', value: pass,
      onChange: function(e) { setPass(e.target.value); },
      onKeyDown: function(e) { if (e.key === 'Enter') submit(); },
      placeholder: 'min. 8 znakow',
      style: inputStyle
    }),
    ce('label', { style: { display: 'flex', alignItems: 'center', gap: 8,
                            marginTop: 14, cursor: 'pointer',
                            fontSize: 13, color: 'var(--t2)' } },
      ce('input', { type: 'checkbox', checked: isAdmin,
                    onChange: function(e) { setIsAdmin(e.target.checked); } }),
      ce('span', null, 'Admin firmy ',
        ce('span', { style: { fontSize: 11, color: 'var(--t3)' } },
          '(flaga zapisana, funkcjonalnosc do wdrozenia)'))
    ),
    ce('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
      ce('button', { onClick: p.onClose, disabled: busy, style: secondaryButtonStyle }, 'Anuluj'),
      ce('button', { onClick: submit,
                     disabled: busy || !email.trim() || pass.length < 8,
                     style: primaryButtonStyle(busy || !email.trim() || pass.length < 8) },
        busy ? 'Tworze...' : 'Utworz')
    )
  );
}

// ── Edit-user-profile modal (imie/kolor awatara) ──────────────────────────
function EditUserProfileModal(p) {
  var sName = useState(p.user.display_name || ''), displayName = sName[0], setDisplayName = sName[1];
  var sColor = useState(p.user.color || USER_COLORS[0]), color = sColor[0], setColor = sColor[1];
  var sBusy = useState(false), busy = sBusy[0], setBusy = sBusy[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];

  function submit() {
    setBusy(true); setErr(null);
    adminApi.updateUserProfile(p.user.id, { display_name: displayName.trim(), color: color }).then(function() {
      p.onSaved();
    }).catch(function(e) {
      setErr(e.message || 'Blad zapisu');
      setBusy(false);
    });
  }

  return ce(ModalShell, { title: 'Profil \u2014 ' + p.user.email, onClose: p.onClose },
    err ? ce('div', { style: { padding: 10, marginBottom: 12, background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                                color: '#ef4444', fontSize: 13 } }, err) : null,
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6 } },
      'Imie (widoczne jako awatar w CRM)'),
    ce('input', {
      autoFocus: true, type: 'text', value: displayName,
      onChange: function(e) { setDisplayName(e.target.value); },
      onKeyDown: function(e) { if (e.key === 'Enter') submit(); },
      placeholder: 'np. Paulina',
      style: inputStyle
    }),
    ce('label', { style: { display: 'block', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.08em', color: 'var(--t3)',
                            textTransform: 'uppercase', marginBottom: 6, marginTop: 14 } },
      'Kolor awatara'),
    ce(ColorPicker, { value: color, onChange: setColor }),
    ce('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
      ce('button', { onClick: p.onClose, disabled: busy, style: secondaryButtonStyle }, 'Anuluj'),
      ce('button', { onClick: submit, disabled: busy, style: primaryButtonStyle(busy) },
        busy ? 'Zapisuje...' : 'Zapisz')
    )
  );
}

// ── Main admin screen ──────────────────────────────────────────────────────
export function ScreenAdmin() {
  var sTenants = useState(null), tenants = sTenants[0], setTenants = sTenants[1];
  var sSelected = useState(null), selectedId = sSelected[0], setSelectedId = sSelected[1];
  var sUsers = useState(null), users = sUsers[0], setUsers = sUsers[1];
  var sLoadingUsers = useState(false), loadingUsers = sLoadingUsers[0], setLoadingUsers = sLoadingUsers[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];
  var sShowCT = useState(false), showCT = sShowCT[0], setShowCT = sShowCT[1];
  var sShowCU = useState(false), showCU = sShowCU[0], setShowCU = sShowCU[1];
  var sShowET = useState(false), showET = sShowET[0], setShowET = sShowET[1];
  var sShowDT = useState(false), showDT = sShowDT[0], setShowDT = sShowDT[1];
  var sEditUser = useState(null), editUser = sEditUser[0], setEditUser = sEditUser[1];

  function loadTenants() {
    setErr(null);
    adminApi.getTenants().then(function(data) {
      setTenants(data || []);
      // Auto-select first tenant if none selected
      if (data && data.length > 0) {
        setSelectedId(function(prev) { return prev || data[0].id; });
      }
    }).catch(function(e) {
      setErr(e.message || 'Blad ladowania tenantow');
      setTenants([]);
    });
  }

  function loadUsers(tenantId) {
    if (!tenantId) { setUsers(null); return; }
    setLoadingUsers(true);
    setErr(null);
    adminApi.getUsers(tenantId).then(function(data) {
      setUsers(data || []);
      setLoadingUsers(false);
    }).catch(function(e) {
      setErr(e.message || 'Blad ladowania userow');
      setLoadingUsers(false);
      setUsers([]);
    });
  }

  useEffect(function() { loadTenants(); }, []);
  useEffect(function() { loadUsers(selectedId); }, [selectedId]);

  var selectedTenant = tenants && tenants.find(function(t) { return t.id === selectedId; });

  return ce('div', { style: { display: 'flex', gap: 16, height: 'calc(100vh - 200px)', minHeight: 480 } },
    // ─── Left panel: tenants list ───────────────────────────────────────
    ce('div', { style: { width: 320, flexShrink: 0, background: 'var(--bg2)',
                          border: '1px solid var(--bd2)', borderRadius: 14,
                          display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      ce('div', { style: { padding: '14px 14px 10px', borderBottom: '1px solid var(--bd2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        ce('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                              textTransform: 'uppercase', color: 'var(--t3)' } }, 'Tenanci'),
        ce('button', {
          onClick: function() { setShowCT(true); },
          style: { border: 'none', background: 'var(--violet)', color: '#fff',
                    borderRadius: 8, padding: '5px 10px', fontSize: 11,
                    fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }
        }, '+ Nowy')
      ),
      ce('div', { style: { flex: 1, overflowY: 'auto' } },
        tenants === null
          ? ce('div', { style: { padding: 20, color: 'var(--t3)', fontSize: 13 } }, 'Laduje...')
          : tenants.length === 0
            ? ce('div', { style: { padding: 20, color: 'var(--t3)', fontSize: 13 } }, 'Brak tenantow')
            : tenants.map(function(t) {
                var active = t.id === selectedId;
                return ce('div', {
                  key: t.id,
                  onClick: function() { setSelectedId(t.id); },
                  style: {
                    padding: '12px 14px', borderBottom: '0.5px solid var(--bd3)',
                    cursor: 'pointer',
                    background: active ? 'rgba(124,58,237,0.08)' : 'transparent',
                    borderLeft: active ? '3px solid var(--violet)' : '3px solid transparent'
                  }
                },
                  ce('div', { style: { fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 3 } }, t.name),
                  ce('div', { style: { fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 10 } },
                    ce('span', null, '\uD83D\uDC65 ' + (t.user_count || 0) + ' user' + ((t.user_count || 0) === 1 ? '' : 'ow')),
                    ce('span', null, '\uD83D\uDCCB ' + (t.client_count || 0) + ' klient' + ((t.client_count || 0) === 1 ? '' : 'ow'))
                  )
                );
              })
      )
    ),
    // ─── Right panel: selected tenant detail ────────────────────────────
    ce('div', { style: { flex: 1, minWidth: 0, background: 'var(--bg2)',
                          border: '1px solid var(--bd2)', borderRadius: 14,
                          display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      selectedTenant
        ? ce(React.Fragment, null,
            ce('div', { style: { padding: '16px 18px', borderBottom: '1px solid var(--bd2)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              ce('div', null,
                ce('div', { style: { fontSize: 18, fontWeight: 700, color: 'var(--t1)' } }, selectedTenant.name),
                ce('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 4,
                                       fontFamily: 'monospace' } }, selectedTenant.id)
              ),
              ce('div', { style: { display: 'flex', gap: 8 } },
                ce('button', {
                  onClick: function() { setShowET(true); },
                  style: { border: '1px solid var(--bd2)', background: 'var(--bg)', color: 'var(--t2)',
                            borderRadius: 10, padding: '8px 14px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }
                }, '\u270E Edytuj branding'),
                (selectedTenant.config && selectedTenant.config.builtin_catalog) ? null : ce('button', {
                  onClick: function() { setShowDT(true); },
                  style: { border: '1px solid rgba(220,38,38,0.4)', background: 'transparent', color: '#dc2626',
                            borderRadius: 10, padding: '8px 14px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }
                }, '\uD83D\uDDD1 Usu\u0144'),
                ce('button', {
                  onClick: function() { setShowCU(true); },
                  style: { border: 'none', background: 'var(--violet)', color: '#fff',
                            borderRadius: 10, padding: '8px 14px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }
                }, '+ Dodaj usera')
              )
            ),
            ce('div', { style: { flex: 1, overflowY: 'auto', padding: 14 } },
              err ? ce('div', { style: { padding: 12, marginBottom: 12,
                                          background: 'rgba(239,68,68,0.08)',
                                          border: '1px solid rgba(239,68,68,0.2)',
                                          borderRadius: 8, color: '#ef4444', fontSize: 13 } }, err) : null,
              loadingUsers
                ? ce('div', { style: { padding: 20, color: 'var(--t3)', fontSize: 13 } }, 'Laduje userow...')
                : users === null || users.length === 0
                  ? ce('div', { style: { padding: 20, color: 'var(--t3)', fontSize: 13 } },
                      'Brak userow w tym tenancie')
                  : ce('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
                      ce('thead', null,
                        ce('tr', { style: { borderBottom: '1px solid var(--bd2)' } },
                          ce('th', { style: thStyle }, 'Zespol'),
                          ce('th', { style: thStyle }, 'Email'),
                          ce('th', { style: thStyle }, 'Utworzony'),
                          ce('th', { style: thStyle }, 'Ostatnie logowanie'),
                          ce('th', { style: thStyle }, 'Role'),
                          ce('th', { style: thStyle }, 'Status'),
                          ce('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, 'Akcje')
                        )
                      ),
                      ce('tbody', null,
                        users.map(function(u) {
                          var banned = u.banned_until && new Date(u.banned_until) > new Date();
                          var roles = [];
                          if (u.is_super_admin) roles.push('SUPER');
                          if (u.is_tenant_admin) roles.push('Admin firmy');
                          var rolesStr = roles.join(', ') || '\u2014';
                          return ce('tr', { key: u.id, style: { borderBottom: '0.5px solid var(--bd3)', opacity: banned ? 0.5 : 1 } },
                            ce('td', { style: { padding: '10px 6px' } },
                              ce('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                                ce(UserAvatar, { name: u.display_name, email: u.email, color: u.color }),
                                ce('span', { style: { fontSize: 12, color: 'var(--t2)' } }, u.display_name || '\u2014')
                              )
                            ),
                            ce('td', { style: { padding: '10px 6px', color: 'var(--t1)' } }, u.email),
                            ce('td', { style: { padding: '10px 6px', color: 'var(--t3)', fontSize: 12 } },
                              u.created_at ? new Date(u.created_at).toLocaleDateString('pl-PL') : '\u2014'),
                            ce('td', { style: { padding: '10px 6px', color: 'var(--t3)', fontSize: 12 } },
                              u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('pl-PL') : 'nigdy'),
                            ce('td', { style: { padding: '10px 6px', color: 'var(--t2)', fontSize: 12 } }, rolesStr),
                            ce('td', { style: { padding: '10px 6px' } },
                              banned
                                ? ce('span', { style: { background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                                                          padding: '3px 8px', borderRadius: 6,
                                                          fontSize: 11, fontWeight: 600 } }, 'Zawieszony')
                                : ce('span', { style: { background: 'rgba(5,150,105,0.12)', color: '#059669',
                                                          padding: '3px 8px', borderRadius: 6,
                                                          fontSize: 11, fontWeight: 600 } }, 'Aktywny')
                            ),
                            ce('td', { style: { padding: '10px 6px', textAlign: 'right' } },
                              ce('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
                                ce('button', {
                                  onClick: function() { setEditUser(u); },
                                  style: { border: '1px solid var(--bd2)', background: 'var(--bg)',
                                            borderRadius: 8, padding: '5px 12px', fontSize: 11,
                                            cursor: 'pointer', color: 'var(--t2)', fontWeight: 600 }
                                }, '\u270E Profil'),
                                u.is_super_admin
                                  ? null
                                  : ce('button', {
                                      onClick: function() {
                                        var action = banned ? 'reactivate' : 'suspend';
                                        var label = banned
                                          ? 'Reaktywowac usera ' + u.email + '?'
                                          : 'Zawiesic usera ' + u.email + '? Stracze dostep natychmiast.';
                                        if (!window.confirm(label)) return;
                                        adminApi.setUserBan(u.id, action).then(function() {
                                          loadUsers(selectedId);
                                          loadTenants();
                                        }).catch(function(e) { setErr(e.message || 'Blad'); });
                                      },
                                      style: { border: '1px solid var(--bd2)', background: 'var(--bg)',
                                                borderRadius: 8, padding: '5px 12px', fontSize: 11,
                                                cursor: 'pointer',
                                                color: banned ? '#059669' : '#ef4444', fontWeight: 600 }
                                    }, banned ? 'Reaktywuj' : 'Zawies')
                              )
                            )
                          );
                        })
                      )
                    )
            )
          )
        : ce('div', { style: { padding: 30, color: 'var(--t3)', fontSize: 13 } },
            'Wybierz tenanta z listy po lewej')
    ),
    // ─── Modals ─────────────────────────────────────────────────────────
    showCT ? ce(CreateTenantModal, {
      onClose: function() { setShowCT(false); },
      onCreated: function() { setShowCT(false); loadTenants(); }
    }) : null,
    showCU && selectedTenant ? ce(CreateUserModal, {
      tenant: selectedTenant,
      onClose: function() { setShowCU(false); },
      onCreated: function() { setShowCU(false); loadUsers(selectedId); loadTenants(); }
    }) : null,
    showDT && selectedTenant ? ce(DeleteTenantModal, {
      tenant: selectedTenant,
      onClose: function() { setShowDT(false); },
      onDeleted: function(res) {
        setShowDT(false); setSelectedId(null); setUsers(null); loadTenants();
        if (res && res.failed_users && res.failed_users.length) alert('Tenant usuni\u0119ty, ale nie uda\u0142o si\u0119 usun\u0105\u0107 kont: ' + res.failed_users.join(', '));
      }
    }) : null,
    showET && selectedTenant ? ce(EditTenantModal, {
      tenant: selectedTenant,
      onClose: function() { setShowET(false); },
      onSaved: function() { setShowET(false); loadTenants(); }
    }) : null,
    editUser ? ce(EditUserProfileModal, {
      user: editUser,
      onClose: function() { setEditUser(null); },
      onSaved: function() { setEditUser(null); loadUsers(selectedId); }
    }) : null
  );
}
