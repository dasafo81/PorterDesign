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
    ce('div', { style: { background: 'var(--bg2)', borderRadius: 16, padding: 24,
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

// ── Create-user modal ──────────────────────────────────────────────────────
function CreateUserModal(p) {
  var sEmail = useState(''), email = sEmail[0], setEmail = sEmail[1];
  var sPass = useState(''), pass = sPass[0], setPass = sPass[1];
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
      is_tenant_admin: isAdmin
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

// ── Main admin screen ──────────────────────────────────────────────────────
export function ScreenAdmin() {
  var sTenants = useState(null), tenants = sTenants[0], setTenants = sTenants[1];
  var sSelected = useState(null), selectedId = sSelected[0], setSelectedId = sSelected[1];
  var sUsers = useState(null), users = sUsers[0], setUsers = sUsers[1];
  var sLoadingUsers = useState(false), loadingUsers = sLoadingUsers[0], setLoadingUsers = sLoadingUsers[1];
  var sErr = useState(null), err = sErr[0], setErr = sErr[1];
  var sShowCT = useState(false), showCT = sShowCT[0], setShowCT = sShowCT[1];
  var sShowCU = useState(false), showCU = sShowCU[0], setShowCU = sShowCU[1];

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
              ce('button', {
                onClick: function() { setShowCU(true); },
                style: { border: 'none', background: 'var(--violet)', color: '#fff',
                          borderRadius: 10, padding: '8px 14px', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }
              }, '+ Dodaj usera')
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
                              u.is_super_admin
                                ? ce('span', { style: { color: 'var(--t3)', fontSize: 11 } }, '\u2014')
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
    }) : null
  );
}
