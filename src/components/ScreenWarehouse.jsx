import React, { useState, useEffect } from 'react';
import { sbApi } from '../lib/supabase.js';
import {
  FABRICS, TAPETY, RS_MOTORS, RS_REMOTES, KN_LIST, KN_PILOTY,
  PRESTIGE_PILOTY, PRESTIGE_CENTRALKI, RRZ_SOMFY_ACC, RRZ_PREMIUM_ACC,
  KD_AKCESORIA, RS_MASKS
} from '../constants/data.js';
const ce = React.createElement;

// ── Konfiguracja ─────────────────────────────────────────────────────────────
var CATEGORIES = [
  { id: "tkanina",   label: "Tkaniny",             icon: "\uD83E\uDDF5", unit: "mb",  lowAt: 3 },
  { id: "mechanizm", label: "Mechanizmy/Akcesoria", icon: "\u2699\uFE0F", unit: "szt", lowAt: 5 },
  { id: "gotowy",    label: "Gotowe produkty",      icon: "\uD83E\uDE9F", unit: "szt", lowAt: 1 },
  { id: "probnik",   label: "Pr\u00F3bniki/Katalogi",   icon: "\uD83D\uDCD6", unit: "szt", lowAt: 1 }
];

var RAIL_TYPES = ["KS", "DS", "Slim", "Prestige Round", "Prestige Square"];

function stockBadge(item) {
  var qty = +(item.quantity || 0);
  var cat = CATEGORIES.find(function(c) { return c.id === item.category; });
  var low = cat ? cat.lowAt : 2;
  if (qty === 0) return { label: "Brak", color: "#dc2626", bg: "rgba(220,38,38,0.10)" };
  if (qty <= low) return { label: "Ma\u0142o", color: "#d97706", bg: "rgba(217,119,6,0.10)" };
  return { label: "OK", color: "#059669", bg: "rgba(5,150,105,0.10)" };
}

var inp = { fontSize: 13, border: "1.5px solid var(--bd2)", borderRadius: 9, background: "var(--bg)", color: "var(--t1)", padding: "9px 12px", width: "100%", boxSizing: "border-box", outline: "none" };
var btn = function(extra) { return Object.assign({ border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }, extra); };

// ── Modal dodaj/edytuj pozycję magazynową ────────────────────────────────────
function ModalItem(p) {
  var isNew = !p.item || !p.item.id;
  var def = p.item || {};
  var s1 = useState(def.name || "");           var name = s1[0]; var setName = s1[1];
  var s2 = useState(def.category || "mechanizm"); var cat = s2[0]; var setCat = s2[1];
  var s3 = useState(def.quantity != null ? String(def.quantity) : ""); var qty = s3[0]; var setQty = s3[1];
  var s4 = useState(def.unit || "szt");          var unit = s4[0]; var setUnit = s4[1];
  var s5 = useState(def.color || "");           var color = s5[0]; var setColor = s5[1];
  var s6 = useState(def.supplier || "");        var supplier = s6[0]; var setSupplier = s6[1];
  var s7 = useState(def.location || "");        var location = s7[0]; var setLocation = s7[1];
  var s8 = useState(def.notes || "");           var notes = s8[0]; var setNotes = s8[1];
  var s9 = useState(false);                     var busy = s9[0]; var setBusy = s9[1];
  var s10 = useState(null);                     var err = s10[0]; var setErr = s10[1];

  useEffect(function() {
    var cat_obj = CATEGORIES.find(function(c) { return c.id === cat; });
    if (cat_obj) setUnit(cat_obj.unit);
  }, [cat]);

  function save() {
    if (!name.trim()) { setErr("Podaj nazw\u0119"); return; }
    setBusy(true); setErr(null);
    var payload = { name: name.trim(), category: cat, quantity: parseFloat(qty) || 0, unit: unit, color: color.trim(), supplier: supplier.trim(), location: location.trim(), notes: notes.trim() };
    var prom = isNew ? sbApi.addWarehouseItem(payload) : sbApi.updateWarehouseItem(p.item.id, payload);
    prom.then(function() { p.onSave(); }).catch(function(e) { setErr(e.message || "B\u0142\u0105d zapisu"); setBusy(false); });
  }

  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 18, padding: "24px 22px", width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.20)" } },
      ce("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
        ce("div", { style: { fontSize: 16, fontWeight: 700 } }, isNew ? "Nowa pozycja" : "Edytuj pozycj\u0119"),
        ce("button", { onClick: p.onClose, style: { border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--t3)" } }, "\u00D7")
      ),
      err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b91c1c", marginBottom: 12 } }, err),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Kategoria"),
        ce("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
          CATEGORIES.map(function(c) {
            var active = cat === c.id;
            return ce("button", { key: c.id, onClick: function() { setCat(c.id); }, style: { padding: "6px 12px", borderRadius: 8, border: active ? "1.5px solid var(--violet)" : "1.5px solid var(--bd2)", background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t2)", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer" } },
              c.icon + " " + c.label);
          })
        )
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Nazwa *"),
        ce("input", { value: name, onChange: function(e) { setName(e.target.value); }, placeholder: "np. Velvet Monaco, Silent 19mm biały...", style: inp })
      ),
      ce("div", { style: { display: "flex", gap: 10, marginBottom: 12 } },
        ce("div", { style: { flex: 2 } },
          ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Ilo\u015B\u0107"),
          ce("input", { type: "number", min: "0", step: cat === "tkanina" ? "0.5" : "1", value: qty, placeholder: "0", onChange: function(e) { setQty(e.target.value); }, style: inp })
        ),
        ce("div", { style: { flex: 1 } },
          ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Jednostka"),
          ce("input", { value: unit, onChange: function(e) { setUnit(e.target.value); }, style: inp })
        )
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Kolor / wariant"),
        ce("input", { value: color, onChange: function(e) { setColor(e.target.value); }, placeholder: "np. Beige 02, ecru...", style: inp })
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Dostawca / producent"),
        ce("input", { value: supplier, onChange: function(e) { setSupplier(e.target.value); }, placeholder: "np. Linia Dekor...", style: inp })
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Lokalizacja"),
        ce("input", { value: location, onChange: function(e) { setLocation(e.target.value); }, placeholder: "np. Rega\u0142 A, p\u00F3\u0142ka 2...", style: inp })
      ),
      ce("div", { style: { marginBottom: 20 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Uwagi"),
        ce("textarea", { value: notes, onChange: function(e) { setNotes(e.target.value); }, rows: 2, style: Object.assign({}, inp, { resize: "vertical" }) })
      ),
      ce("div", { style: { display: "flex", gap: 10 } },
        ce("button", { onClick: p.onClose, style: btn({ flex: 1, padding: 12, background: "var(--bg2)", color: "var(--t2)", border: "1.5px solid var(--bd2)" }) }, "Anuluj"),
        ce("button", { onClick: save, disabled: busy, style: btn({ flex: 2, padding: 12, background: "var(--violet)", color: "#fff", opacity: busy ? 0.7 : 1 }) }, busy ? "Zapisuj\u0119..." : (isNew ? "+ Dodaj" : "Zapisz"))
      )
    )
  );
}

// ── Karta pozycji magazynowej ─────────────────────────────────────────────────
function ItemCard(p) {
  var item = p.item;
  var badge = stockBadge(item);
  var cat = CATEGORIES.find(function(c) { return c.id === item.category; }) || { icon: "\uD83D\uDCE6" };
  return ce("div", { style: { background: "var(--bg2)", border: "1.5px solid var(--bd2)", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 } },
    ce("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 } },
      ce("span", { style: { fontSize: 22, lineHeight: 1, marginTop: 2 } }, cat.icon),
      ce("div", { style: { flex: 1, minWidth: 0 } },
        ce("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.name),
        ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 2 } },
          [item.color, item.supplier].filter(Boolean).join(" \u00B7 "))
      ),
      ce("div", { style: { background: badge.bg, color: badge.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 } }, badge.label)
    ),
    ce("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      ce("div", { style: { flex: 1, display: "flex", alignItems: "baseline", gap: 4 } },
        ce("span", { style: { fontSize: 24, fontWeight: 800, color: badge.color } }, item.quantity),
        ce("span", { style: { fontSize: 12, color: "var(--t3)" } }, item.unit || "szt")
      ),
      ce("button", { onClick: function() { p.onAdjust(item, -1); }, style: { border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t2)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, fontWeight: 700 } }, "\u2212"),
      ce("button", { onClick: function() { p.onAdjust(item, +1); }, style: { border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t2)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, fontWeight: 700 } }, "+"),
      ce("button", { onClick: function() { p.onEdit(item); }, style: { border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t3)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14 } }, "\u270F\uFE0F"),
      ce("button", { onClick: function() { p.onDelete(item); }, style: { border: "1.5px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "#dc2626", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 13 } }, "\uD83D\uDDD1")
    ),
    (item.location || item.notes) && ce("div", { style: { fontSize: 11, color: "var(--t3)", borderTop: "1px solid var(--bd3)", paddingTop: 6 } },
      [item.location && "\uD83D\uDCCC " + item.location, item.notes && "\uD83D\uDCAC " + item.notes].filter(Boolean).join("  "))
  );
}

// ── Modal dodaj ścinke szyny ──────────────────────────────────────────────────

// ── Zakładka: Szyny KS ───────────────────────────────────────────────────────
function ModalScrap(p) {
  var s1 = useState("");            var len = s1[0]; var setLen = s1[1];
  var s2 = useState("KS");          var railType = s2[0]; var setRailType = s2[1];
  var s3 = useState("biała");       var color = s3[0]; var setColor = s3[1];
  var s4 = useState(false);         var customColor = s4[0]; var setCustomColor = s4[1];
  var s5 = useState(false);         var busy = s5[0]; var setBusy = s5[1];
  var s6 = useState(null);          var err = s6[0]; var setErr = s6[1];

  var COLORS = ["biała", "czarna", "off white", "inna"];

  function save() {
    var l = parseInt(len);
    if (!l || l < 1) { setErr("Podaj długość w cm"); return; }
    setBusy(true); setErr(null);
    sbApi.addRailScrap({ length_cm: l, rail_type: railType, color: color.trim(), notes: "" })
      .then(function() { p.onSave(); })
      .catch(function(e) { setErr(e.message || "Błąd zapisu"); setBusy(false); });
  }

  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 18, padding: "24px 22px", width: "100%", maxWidth: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.20)" } },
      ce("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
        ce("div", { style: { fontSize: 16, fontWeight: 700 } }, "\uD83D\uDCCF Nowa \u015bcinka"),
        ce("button", { onClick: p.onClose, style: { border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--t3)" } }, "\u00D7")
      ),
      err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b91c1c", marginBottom: 12 } }, err),

      ce("div", { style: { marginBottom: 16 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "D\u0142ugo\u015b\u0107 [cm] *"),
        ce("input", { type: "number", min: "1", value: len, onChange: function(e) { setLen(e.target.value); }, placeholder: "np. 248", autoFocus: true,
          style: { fontSize: 28, fontWeight: 800, textAlign: "center", padding: "12px", border: "1.5px solid var(--bd2)", borderRadius: 10, background: "var(--bg)", color: "var(--t1)", width: "100%", boxSizing: "border-box", outline: "none" } })
      ),

      ce("div", { style: { marginBottom: 16 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Typ"),
        ce("div", { style: { display: "flex", gap: 6 } },
          RAIL_TYPES.map(function(t) {
            var active = railType === t;
            return ce("button", { key: t, onClick: function() { setRailType(t); },
              style: { flex: 1, padding: "6px 8px", borderRadius: 8, border: active ? "1.5px solid var(--violet)" : "1.5px solid var(--bd2)", background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t2)", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer" } }, t);
          })
        )
      ),

      ce("div", { style: { marginBottom: 22 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Kolor"),
        ce("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
          COLORS.map(function(c) {
            var isInna = c === "inna";
            var active = isInna ? customColor : (color === c && !customColor);
            return ce("button", { key: c, onClick: function() {
                if (isInna) { setCustomColor(true); setColor(""); }
                else { setCustomColor(false); setColor(c); }
              },
              style: { padding: "7px 14px", borderRadius: 8, border: active ? "1.5px solid var(--violet)" : "1.5px solid var(--bd2)", background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t2)", fontSize: 13, fontWeight: active ? 700 : 400, cursor: "pointer" } }, c);
          })
        ),
        customColor && ce("input", { value: color, onChange: function(e) { setColor(e.target.value); }, placeholder: "Wpisz kolor...",
          style: { marginTop: 8, fontSize: 13, padding: "9px 12px", border: "1.5px solid var(--violet)", borderRadius: 9, background: "var(--bg)", color: "var(--t1)", width: "100%", boxSizing: "border-box", outline: "none" } })
      ),

      ce("div", { style: { display: "flex", gap: 10 } },
        ce("button", { onClick: p.onClose, style: { flex: 1, padding: 12, borderRadius: 10, border: "1.5px solid var(--bd2)", background: "var(--bg2)", color: "var(--t2)", fontSize: 13, fontWeight: 600, cursor: "pointer" } }, "Anuluj"),
        ce("button", { onClick: save, disabled: busy, style: { flex: 2, padding: 12, borderRadius: 10, border: "none", background: "var(--violet)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 } }, busy ? "Dodaję..." : "+ Dodaj ścinkę")
      )
    )
  );
}

function TabRails(p) {
  var s1 = useState([]);    var scraps = s1[0]; var setScraps = s1[1];
  var s2 = useState(true);  var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(null);  var err = s3[0]; var setErr = s3[1];
  var s4 = useState(false); var showModal = s4[0]; var setShowModal = s4[1];
  var s5 = useState("");    var filterType = s5[0]; var setFilterType = s5[1];

  function reload() {
    setLoading(true);
    sbApi.getRailScraps()
      .then(function(data) { setScraps(data || []); setLoading(false); })
      .catch(function(e) { setErr(e.message); setLoading(false); });
  }
  useEffect(function() { reload(); }, []);

  function handleDelete(scrap) {
    if (!confirm("Usun\u0105\u0107 \u015bcink\u0119 " + scrap.length_cm + " cm (" + scrap.color + ", " + scrap.rail_type + ")?")) return;
    sbApi.deleteRailScrap(scrap.id)
      .then(function() { setScraps(function(prev) { return prev.filter(function(x) { return x.id !== scrap.id; }); }); })
      .catch(function(e) { alert("B\u0142\u0105d: " + e.message); });
  }

  var allTypes = [];
  scraps.forEach(function(s) {
    if (s.rail_type && allTypes.indexOf(s.rail_type) === -1) allTypes.push(s.rail_type);
  });

  var filtered = scraps.filter(function(s) {
    if (filterType && s.rail_type !== filterType) return false;
    return true;
  });

  // Kolory w ustalonej kolejności
  var COLOR_ORDER = ["bia\u0142a", "czarna", "off white"];
  var colorSet = [];
  filtered.forEach(function(s) {
    var c = (s.color || "inna").toLowerCase();
    if (colorSet.indexOf(c) === -1) colorSet.push(c);
  });
  colorSet.sort(function(a, b) {
    var ai = COLOR_ORDER.indexOf(a); var bi = COLOR_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  // Grupuj per kolor, sortuj malejąco
  var byColor = {};
  colorSet.forEach(function(c) { byColor[c] = []; });
  filtered.forEach(function(s) {
    var c = (s.color || "inna").toLowerCase();
    if (!byColor[c]) byColor[c] = [];
    byColor[c].push(s);
  });
  colorSet.forEach(function(c) {
    byColor[c].sort(function(a, b) { return b.length_cm - a.length_cm; });
  });

  var maxRows = colorSet.reduce(function(m, c) { return Math.max(m, (byColor[c]||[]).length); }, 0);

  var COLOR_DOT = { "bia\u0142a": "#f0f0ec", "czarna": "#1a1a1a", "off white": "#ede8d8" };
  var COLOR_DOT_BORDER = { "czarna": "#555" };
  var TYPE_COLOR = { "KS": "#185FA5", "DS": "#3B6D11", "Slim": "#854F0B", "Prestige Round": "#993556", "Prestige Square": "#993C1D" };
  var TYPE_BG    = { "KS": "#E6F1FB", "DS": "#EAF3DE", "Slim": "#FAEEDA", "Prestige Round": "#FBEAF0", "Prestige Square": "#FAECE7" };

  function typeBadge(t) {
    if (!t) return null;
    var bg = TYPE_BG[t] || "var(--bg2)";
    var col = TYPE_COLOR[t] || "var(--t3)";
    return ce("span", { style: { display: "inline-block", padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: bg, color: col, whiteSpace: "nowrap" } }, t);
  }

  var pillBase   = { padding: "4px 11px", borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer", border: "0.5px solid var(--bd2)", background: "var(--bg2)", color: "var(--t2)" };
  var pillActive = Object.assign({}, pillBase, { background: "#EEEDFE", borderColor: "#AFA9EC", color: "#3C3489" });

  // Szerokość kolumny per kolor zależy od liczby kolorów
  var colW = colorSet.length > 0 ? Math.floor(100 / colorSet.length) + "%" : "33%";

  return ce("div", null,

    // Nagłówek
    ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 } },
      ce("div", null,
        ce("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)" } }, "\uD83D\uDCCF \u015acinki szyn KS"),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } }, filtered.length + " szt.")
      ),
      ce("button", { onClick: function() { setShowModal(true); },
        style: { padding: "8px 16px", background: "var(--violet)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 } },
        "+ Dodaj \u015bcink\u0119")
    ),

    // Filtr typ
    ce("div", { style: { display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" } },
      ce("span", { style: { fontSize: 11, color: "var(--t3)", marginRight: 2 } }, "Typ:"),
      ce("button", { onClick: function() { setFilterType(""); }, style: filterType === "" ? pillActive : pillBase }, "Wszystkie"),
      allTypes.map(function(t) {
        return ce("button", { key: t, onClick: function() { setFilterType(filterType === t ? "" : t); }, style: filterType === t ? pillActive : pillBase }, t);
      })
    ),

    err && ce("div", { style: { color: "#dc2626", fontSize: 13, marginBottom: 10 } }, err),
    loading && ce("div", { style: { color: "var(--t3)", fontSize: 13, padding: "20px 0" } }, "\u23f3 \u0141adowanie..."),
    !loading && filtered.length === 0 && ce("div", { style: { color: "var(--t3)", fontSize: 13, padding: "20px 0" } }, "Brak \u015bcinek."),

    // Tabela 3-kolumnowa
    !loading && filtered.length > 0 && ce("div", { style: { border: "0.5px solid var(--bd2)", borderRadius: 12, overflow: "hidden" } },
      ce("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },

        // Nagłówki kolorów
        ce("thead", null,
          ce("tr", null,
            colorSet.map(function(color) {
              var dotBg = COLOR_DOT[color] || "#a78bfa";
              var dotBorder = COLOR_DOT_BORDER[color] || "var(--bd2)";
              return ce("th", { key: color, colSpan: 2,
                style: { padding: "8px 12px", background: "var(--bg2)", borderBottom: "0.5px solid var(--bd2)",
                  borderRight: "0.5px solid var(--bd2)", fontSize: 12, fontWeight: 600, color: "var(--t1)", textAlign: "left" } },
                ce("span", { style: { display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: dotBg, border: "0.5px solid " + dotBorder, marginRight: 6, verticalAlign: "middle" } }),
                color.charAt(0).toUpperCase() + color.slice(1),
                ce("span", { style: { fontSize: 10, color: "var(--t3)", fontWeight: 400, marginLeft: 6 } }, (byColor[color]||[]).length + " szt.")
              );
            })
          ),
          // Sub-nagłówki: cm / typ per każdy kolor
          ce("tr", null,
            colorSet.map(function(color) {
              return [
                ce("th", { key: color + "-len", style: { padding: "4px 12px", background: "var(--bg2)", borderBottom: "0.5px solid var(--bd2)", fontSize: 9, fontWeight: 600, color: "var(--t3)", textAlign: "left", letterSpacing: ".05em", textTransform: "uppercase", width: "10%" } }, "cm"),
                ce("th", { key: color + "-type", style: { padding: "4px 12px", background: "var(--bg2)", borderBottom: "0.5px solid var(--bd2)", borderRight: "0.5px solid var(--bd2)", fontSize: 9, fontWeight: 600, color: "var(--t3)", textAlign: "left", letterSpacing: ".05em", textTransform: "uppercase" } }, "typ")
              ];
            })
          )
        ),

        // Wiersze danych
        ce("tbody", null,
          Array.from({ length: maxRows }, function(_, i) {
            return ce("tr", { key: i, style: { background: i % 2 === 0 ? "var(--bg)" : "var(--bg2)" } },
              colorSet.map(function(color) {
                var scrap = (byColor[color] || [])[i];
                if (!scrap) {
                  return [
                    ce("td", { key: color + "-len", style: { padding: "6px 12px", borderBottom: "0.5px solid var(--bd3)" } }),
                    ce("td", { key: color + "-type", style: { padding: "6px 12px", borderBottom: "0.5px solid var(--bd3)", borderRight: "0.5px solid var(--bd2)" } })
                  ];
                }
                return [
                  ce("td", { key: color + "-len", style: { padding: "5px 12px", borderBottom: "0.5px solid var(--bd3)" } },
                    ce("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
                      ce("span", { style: { fontSize: 15, fontWeight: 600, color: "var(--violet)" } }, scrap.length_cm),
                      ce("span", { style: { fontSize: 9, color: "var(--t3)" } }, "cm"),
                      ce("button", { onClick: function() { handleDelete(scrap); }, title: "Usu\u0144",
                        style: { border: "none", background: "none", cursor: "pointer", color: "var(--t3)", fontSize: 12, padding: "0 2px", opacity: .4, marginLeft: 2, lineHeight: 1 } }, "\uD83D\uDDD1")
                    )
                  ),
                  ce("td", { key: color + "-type", style: { padding: "5px 12px", borderBottom: "0.5px solid var(--bd3)", borderRight: "0.5px solid var(--bd2)" } },
                    typeBadge(scrap.rail_type)
                  )
                ];
              })
            );
          })
        )
      )
    ),

    showModal && ce(ModalScrap, {
      onSave: function() { setShowModal(false); reload(); },
      onClose: function() { setShowModal(false); }
    })
  );
}


function TabWarehouse(p) {
  var s1 = useState([]);    var items = s1[0]; var setItems = s1[1];
  var s2 = useState(true);  var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(null);  var err = s3[0]; var setErr = s3[1];
  var s4 = useState("all"); var activeCat = s4[0]; var setActiveCat = s4[1];
  var s5 = useState("");    var search = s5[0]; var setSearch = s5[1];
  var s6 = useState(null);  var editItem = s6[0]; var setEditItem = s6[1];
  var s7 = useState(false); var showLow = s7[0]; var setShowLow = s7[1];

  function reload() {
    setLoading(true);
    sbApi.getWarehouseItems()
      .then(function(data) { setItems(data || []); setLoading(false); })
      .catch(function(e) { setErr(e.message); setLoading(false); });
  }
  useEffect(function() { reload(); }, []);

  function handleAdjust(item, delta) {
    var newQty = Math.max(0, (+(item.quantity) || 0) + delta);
    sbApi.updateWarehouseItem(item.id, { quantity: newQty })
      .then(function() { setItems(function(prev) { return prev.map(function(x) { return x.id === item.id ? Object.assign({}, x, { quantity: newQty }) : x; }); }); })
      .catch(function(e) { alert("B\u0142\u0105d: " + e.message); });
  }

  function handleDelete(item) {
    if (!confirm("Usun\u0105\u0107 \u201E" + item.name + "\u201C?")) return;
    sbApi.deleteWarehouseItem(item.id)
      .then(function() { setItems(function(prev) { return prev.filter(function(x) { return x.id !== item.id; }); }); })
      .catch(function(e) { alert("B\u0142\u0105d: " + e.message); });
  }

  var lowCount = items.filter(function(x) { return stockBadge(x).label !== "OK"; }).length;

  var allCats = [{ id: "all", label: "Wszystko", icon: "\uD83D\uDCE6" }].concat(CATEGORIES);
  var filtered = items.filter(function(item) {
    if (activeCat !== "all" && item.category !== activeCat) return false;
    if (showLow && stockBadge(item).label === "OK") return false;
    if (search.trim()) {
      var q = search.toLowerCase();
      return (item.name || "").toLowerCase().includes(q) || (item.color || "").toLowerCase().includes(q) || (item.supplier || "").toLowerCase().includes(q);
    }
    return true;
  });

  return ce("div", null,
    ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 } },
      ce("div", null,
        ce("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)" } }, "\uD83D\uDCE6 Stan magazynu"),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } }, items.length + " pozycji" + (lowCount > 0 ? " \u00B7 \u26A0\uFE0F " + lowCount + " wymaga uzupe\u0142nienia" : ""))
      ),
      ce("button", { onClick: function() { setEditItem({}); },
        style: btn({ padding: "10px 18px", background: "var(--violet)", color: "#fff", display: "flex", alignItems: "center", gap: 6 }) },
        ce("span", { style: { fontSize: 16 } }, "+"), "Dodaj pozycj\u0119")
    ),

    ce("div", { style: { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" } },
      ce("input", { value: search, onChange: function(e) { setSearch(e.target.value); }, placeholder: "\uD83D\uDD0D Szukaj...",
        style: Object.assign({}, inp, { flex: 1, minWidth: 180 }) }),
      lowCount > 0 && ce("button", { onClick: function() { setShowLow(!showLow); },
        style: { padding: "9px 14px", borderRadius: 10, border: "1.5px solid " + (showLow ? "#d97706" : "var(--bd2)"), background: showLow ? "rgba(217,119,6,0.10)" : "var(--bg2)", color: showLow ? "#d97706" : "var(--t3)", fontSize: 12, fontWeight: 700, cursor: "pointer" } },
        "\u26A0\uFE0F Niski stan (" + lowCount + ")")
    ),

    ce("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 } },
      allCats.map(function(c) {
        var count = c.id === "all" ? items.length : items.filter(function(x) { return x.category === c.id; }).length;
        var active = activeCat === c.id;
        return ce("button", { key: c.id, onClick: function() { setActiveCat(c.id); },
          style: { padding: "14px 20px", borderRadius: 14, border: "1.5px solid " + (active ? "var(--violet)" : "var(--bd2)"), background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t3)", fontSize: 15, fontWeight: active ? 700 : 500, cursor: "pointer", display: "flex", gap: 9, alignItems: "center" } },
          ce("span", { style: { fontSize: 20 } }, c.icon), ce("span", null, c.label),
          ce("span", { style: { background: active ? "rgba(124,58,237,0.15)" : "var(--bd2)", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 700 } }, count));
      })
    ),

    err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: 12, fontSize: 13, color: "#b91c1c", marginBottom: 14 } }, err),
    loading && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } }, "\u23F3 \u0141adowanie..."),

    !loading && filtered.length === 0 && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } },
      ce("div", { style: { fontSize: 36, marginBottom: 10 } }, "\uD83D\uDCE6"),
      ce("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--t1)" } }, search || activeCat !== "all" ? "Brak pasuj\u0105cych pozycji" : "Magazyn jest pusty"),
      ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 6 } }, !search && activeCat === "all" ? "Kliknij + Dodaj pozycj\u0119" : "Zmie\u0144 filtry")
    ),

    !loading && filtered.length > 0 && ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 } },
      filtered.map(function(item) {
        return ce(ItemCard, { key: item.id, item: item, onEdit: function(it) { setEditItem(it); }, onDelete: handleDelete, onAdjust: handleAdjust });
      })
    ),

    editItem !== null && ce(ModalItem, {
      item: editItem && editItem.id ? editItem : null,
      onSave: function() { setEditItem(null); reload(); },
      onClose: function() { setEditItem(null); }
    })
  );
}

// ── Katalog produktów: mnożnik detaliczny per grupa ──────────────────────────
// 1 = cena użyta w silniku wyceny 1:1. KN_* mają już wbudowane ×1.23×2,
// a RS_MOTORS/RS_REMOTES/RRZ_*_ACC/KD_AKCESORIA/FABRICS silnik bierze wprost —
// dlatego domyślnie 1 (parytet z wyceniarką). Zmień per grupa jeśli lista jest hurtowa.
var CATALOG_FACTOR = {
  tkaniny: 1, tapety: 1, silniki_shadow: 1, sterowanie_shadow: 1, silniki_karnisz: 1,
  piloty_karnisz: 1, prestige: 1, acc_somfy: 1, acc_premium: 1, uchwyty_kd: 1, maskownice: 1
};
function fx(gid, price) {
  if (price == null) return null;
  var f = CATALOG_FACTOR[gid] != null ? CATALOG_FACTOR[gid] : 1;
  return Math.round(price * f * 100) / 100;
}
function fmtPrice(v) { return v == null ? "\u2014" : (Math.round(v * 100) / 100).toString().replace(".", ","); }

// ── Katalog: pozycje bazowe ze stałych data.js ───────────────────────────────
function buildBaseCatalog() {
  return [
    { id: "tkaniny", label: "Tkaniny", icon: "\uD83E\uDDF5", tracksHeight: true,
      items: FABRICS.map(function(f) {
        return { baseKey: "tkaniny::" + f.name, name: f.name, price: fx("tkaniny", f.brutto),
          unit: "z\u0142/mb", meta: f.prod || "", heightCm: f.width != null ? f.width : null,
          zakup: f.zakup != null ? f.zakup : null, sklad: f.sklad || "",
          belkowa: f.belkowa != null ? f.belkowa : null };
      }) },
    { id: "tapety", label: "Tapety", icon: "\uD83C\uDFA8",
      items: TAPETY.map(function(t) {
        return { baseKey: "tapety::" + t.name, name: t.name, price: fx("tapety", t.brutto),
          unit: "z\u0142/" + t.jm, meta: t.kolekcja || "", heightCm: null,
          zakup: t.zakup != null ? t.zakup : null, sklad: "" };
      }) },
    { id: "silniki_shadow", label: "Silniki \u2014 Roleta Shadow", icon: "\u2699\uFE0F",
      items: RS_MOTORS.map(function(m) {
        return { baseKey: "silniki_shadow::" + m.id, name: m.label, price: fx("silniki_shadow", m.price),
          unit: "z\u0142", meta: m.type === "wire" ? "przewodowy" : "radiowy", heightCm: null };
      }) },
    { id: "sterowanie_shadow", label: "Sterowanie \u2014 Roleta Shadow", icon: "\uD83D\uDCE1",
      items: RS_REMOTES.map(function(r) {
        return { baseKey: "sterowanie_shadow::" + r.id, name: r.label, price: fx("sterowanie_shadow", r.price),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "silniki_karnisz", label: "Silniki \u2014 Karnisz elektryczny", icon: "\u26A1",
      items: KN_LIST.map(function(m) {
        return { baseKey: "silniki_karnisz::" + m.v, name: m.l, price: fx("silniki_karnisz", m.cena),
          unit: "z\u0142", meta: m.power === "aku" ? "akumulator" : "230V", heightCm: null };
      }) },
    { id: "piloty_karnisz", label: "Piloty \u2014 Karnisz elektryczny", icon: "\uD83C\uDF9B\uFE0F",
      items: KN_PILOTY.filter(function(x) { return x.cena; }).map(function(x) {
        return { baseKey: "piloty_karnisz::" + x.v, name: x.l, price: fx("piloty_karnisz", x.cena),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "prestige", label: "Automatyka \u2014 Karnisz Prestige", icon: "\u26A1",
      items: PRESTIGE_PILOTY.concat(PRESTIGE_CENTRALKI).filter(function(x) { return x.c; }).map(function(x) {
        return { baseKey: "prestige::" + x.v, name: x.l, price: fx("prestige", x.c),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "acc_somfy", label: "Akcesoria \u2014 Roleta rzymska (Somfy)", icon: "\uD83E\uDDF0",
      items: RRZ_SOMFY_ACC.map(function(a) {
        return { baseKey: "acc_somfy::" + a.id, name: a.label, price: fx("acc_somfy", a.price),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "acc_premium", label: "Akcesoria \u2014 Roleta rzymska (Premium Line)", icon: "\uD83E\uDDF0",
      items: RRZ_PREMIUM_ACC.map(function(a) {
        return { baseKey: "acc_premium::" + a.id, name: a.label, price: fx("acc_premium", a.price),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "uchwyty_kd", label: "Uchwyty i akcesoria \u2014 Karnisz dekoracyjny", icon: "\uD83D\uDD29",
      items: KD_AKCESORIA.map(function(a) {
        return { baseKey: "uchwyty_kd::" + a.id, name: a.label, price: fx("uchwyty_kd", a.cena),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "maskownice", label: "Maskownice \u2014 Roleta Shadow", icon: "\uD83E\uDDF1",
      items: Object.keys(RS_MASKS).map(function(k) {
        var lbl = { oval: "Owalna", kwadro: "Kwadratowa", cube: "Cube" }[k] || k;
        return { baseKey: "maskownice::" + k, name: lbl, price: fx("maskownice", RS_MASKS[k]),
          unit: "z\u0142", meta: "", heightCm: null };
      }) },
    { id: "inne", label: "Inne / w\u0142asne", icon: "\uD83D\uDCE6", tracksHeight: false, items: [] }
  ];
}

// ── Katalog: scalenie bazy z nadpisaniami i produktami własnymi z Supabase ────
function mergeCatalog(baseGroups, rows) {
  var ovByKey = {}, customByGroup = {};
  (rows || []).forEach(function(r) {
    if (r.base_key) ovByKey[r.base_key] = r;
    else (customByGroup[r.group_id] = customByGroup[r.group_id] || []).push(r);
  });
  return baseGroups.map(function(g) {
    var items = g.items.map(function(it) {
      var o = ovByKey[it.baseKey];
      return {
        rowId: o ? o.id : null, baseKey: it.baseKey, groupId: g.id, isBase: true,
        overridden: !!o,
        name:     o && o.name != null      ? o.name      : it.name,
        price:    o && o.price != null     ? o.price     : it.price,
        unit:     o && o.unit              ? o.unit      : it.unit,
        meta:     o && o.meta != null      ? o.meta      : it.meta,
        heightCm: o && o.height_cm != null ? o.height_cm : it.heightCm,
        zakup:    o && o.purchase_price != null ? o.purchase_price : it.zakup,
        sklad:    o && o.composition != null ? o.composition : it.sklad,
        belkowa:  o && o.belka_price != null ? o.belka_price : it.belkowa,
        hidden:   o ? !!o.hidden : false
      };
    }).filter(function(m) { return !m.hidden; });
    (customByGroup[g.id] || []).forEach(function(c) {
      items.push({ rowId: c.id, baseKey: null, groupId: g.id, isBase: false, overridden: false,
        name: c.name, price: c.price, unit: c.unit || "z\u0142", meta: c.meta || "", heightCm: c.height_cm,
        zakup: c.purchase_price, sklad: c.composition || "", belkowa: c.belka_price });
    });
    items.forEach(function(m) {
      m.detail = m.heightCm != null ? (m.heightCm + " cm") : null;
      m.warn = (g.tracksHeight && m.heightCm == null) ? "brak wysoko\u015bci" : null;
    });
    return { id: g.id, label: g.label, icon: g.icon, tracksHeight: g.tracksHeight, items: items };
  });
}

// ── Modal: dodaj / edytuj pozycję katalogu ───────────────────────────────────
function ModalCatalogItem(p) {
  var it = p.item || {};
  var isBase = !!it.baseKey;
  var hasRow = !!it.rowId;
  var sG = useState(it.groupId || "inne");                    var grp = sG[0];    var setGrp = sG[1];
  var sN = useState(it.name || "");                           var name = sN[0];   var setName = sN[1];
  var sP = useState(it.price != null ? String(it.price) : ""); var price = sP[0]; var setPrice = sP[1];
  var sU = useState(it.unit || "z\u0142");                    var unit = sU[0];   var setUnit = sU[1];
  var sM = useState(it.meta || "");                           var meta = sM[0];   var setMeta = sM[1];
  var sH = useState(it.heightCm != null ? String(it.heightCm) : ""); var height = sH[0]; var setHeight = sH[1];
  var sZ = useState(it.zakup != null ? String(it.zakup) : "");  var zakup = sZ[0]; var setZakup = sZ[1];
  var sBk = useState(it.belkowa != null ? String(it.belkowa) : ""); var belkowa = sBk[0]; var setBelkowa = sBk[1];
  var sK = useState(it.sklad || "");                            var sklad = sK[0]; var setSklad = sK[1];
  var sB = useState(false);                                   var busy = sB[0];   var setBusy = sB[1];

  function num(v) { return v === "" ? null : parseFloat(String(v).replace(",", ".")); }
  function body() {
    return { group_id: grp, name: name.trim(), price: num(price), unit: unit.trim() || "z\u0142",
      meta: meta.trim() || null, height_cm: num(height), purchase_price: num(zakup),
      belka_price: num(belkowa), composition: sklad.trim() || null };
  }
  function save() {
    if (!name.trim()) return;
    setBusy(true);
    var op;
    if (hasRow) op = sbApi.updateCatalogItem(it.rowId, body());
    else if (isBase) op = sbApi.addCatalogItem(Object.assign({ base_key: it.baseKey }, body()));
    else op = sbApi.addCatalogItem(Object.assign({ base_key: null }, body()));
    op.then(function() { setBusy(false); p.onSave(); })
      .catch(function(e) { setBusy(false); alert("B\u0142\u0105d: " + e.message); });
  }
  function resetBase() {
    if (!hasRow) return;
    setBusy(true);
    sbApi.deleteCatalogItem(it.rowId)
      .then(function() { setBusy(false); p.onSave(); })
      .catch(function(e) { setBusy(false); alert("B\u0142\u0105d: " + e.message); });
  }

  var lbl = { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 };
  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 },
      onClick: function(e) { if (e.target === e.currentTarget) p.onClose(); } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 16, padding: 24, width: "min(440px, 94vw)", maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--bd2)", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" } },
      ce("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)", marginBottom: 4 } },
        hasRow ? "Edytuj pozycj\u0119" : (isBase ? "Edytuj pozycj\u0119 bazow\u0105" : "Nowy produkt")),
      isBase && ce("div", { style: { fontSize: 11, color: "var(--t3)", marginBottom: 16 } },
        "Pozycja z cennika \u2014 zapis utworzy nadpisanie (orygina\u0142 pozostaje w kodzie)."),
      !isBase && ce("div", { style: { height: 12 } }),

      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: lbl }, "Grupa"),
        ce("select", { value: grp, disabled: isBase, onChange: function(e) { setGrp(e.target.value); },
          style: Object.assign({}, inp, { opacity: isBase ? 0.6 : 1 }) },
          p.groups.map(function(g) { return ce("option", { key: g.id, value: g.id }, g.label); }))
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: lbl }, "Nazwa"),
        ce("input", { value: name, onChange: function(e) { setName(e.target.value); }, style: inp })
      ),
      ce("div", { style: { display: "flex", gap: 10, marginBottom: 12 } },
        ce("div", { style: { flex: 2 } },
          ce("div", { style: lbl }, "Cena"),
          ce("input", { value: price, onChange: function(e) { setPrice(e.target.value); }, placeholder: "np. 180", style: inp })),
        ce("div", { style: { flex: 1 } },
          ce("div", { style: lbl }, "Jedn."),
          ce("input", { value: unit, onChange: function(e) { setUnit(e.target.value); }, style: inp }))
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: lbl }, "Wysoko\u015b\u0107 / parametr (cm)"),
        ce("input", { value: height, onChange: function(e) { setHeight(e.target.value); }, placeholder: "np. 300", style: inp })
      ),
      ce("div", { style: { display: "flex", gap: 10, marginBottom: 12 } },
        ce("div", { style: { flex: 1 } },
          ce("div", { style: lbl }, "Cena zakupu"),
          ce("input", { value: zakup, onChange: function(e) { setZakup(e.target.value); }, placeholder: "np. 93", style: inp })),
        ce("div", { style: { flex: 1 } },
          ce("div", { style: lbl }, "Cena belkowa"),
          ce("input", { value: belkowa, onChange: function(e) { setBelkowa(e.target.value); }, placeholder: "np. 42.6", style: inp }))
      ),
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: lbl }, "Sk\u0142ad"),
        ce("input", { value: sklad, onChange: function(e) { setSklad(e.target.value); }, placeholder: "np. 100% PES", style: inp })
      ),
      ce("div", { style: { marginBottom: 20 } },
        ce("div", { style: lbl }, "Producent / opis (inne)"),
        ce("input", { value: meta, onChange: function(e) { setMeta(e.target.value); }, placeholder: "np. MARGO TEXTIL", style: inp })
      ),

      ce("div", { style: { display: "flex", gap: 10 } },
        ce("button", { onClick: p.onClose, style: btn({ flex: 1, padding: 12, background: "var(--bg2)", color: "var(--t2)", border: "1.5px solid var(--bd2)" }) }, "Anuluj"),
        ce("button", { onClick: save, disabled: busy, style: btn({ flex: 2, padding: 12, background: "var(--violet)", color: "#fff", opacity: busy ? 0.7 : 1 }) },
          busy ? "Zapisuj\u0119..." : "Zapisz")
      ),
      isBase && hasRow && ce("button", { onClick: resetBase, disabled: busy,
        style: { marginTop: 10, width: "100%", padding: 10, borderRadius: 10, border: "1.5px solid var(--bd2)", background: "transparent", color: "var(--t3)", fontSize: 12, fontWeight: 600, cursor: "pointer" } },
        "\u21BA Przywr\u00f3\u0107 warto\u015bci z cennika")
    )
  );
}

// ── Zakładka: Katalog ────────────────────────────────────────────────────────
function TabCatalog(p) {
  var s0 = useState([]);    var rows = s0[0];    var setRows = s0[1];
  var s0b = useState(true); var loading = s0b[0]; var setLoading = s0b[1];
  var s0c = useState(null); var err = s0c[0];    var setErr = s0c[1];
  var s1 = useState("");    var search = s1[0];  var setSearch = s1[1];
  var s2 = useState(false); var onlyNoH = s2[0]; var setOnlyNoH = s2[1];
  var s3 = useState(null);  var editItem = s3[0]; var setEditItem = s3[1];
  var s4 = useState("all"); var activeCat = s4[0]; var setActiveCat = s4[1];
  var s4b = useState(null); var activeMeta = s4b[0]; var setActiveMeta = s4b[1];

  function reload() {
    setLoading(true);
    sbApi.getCatalogItems()
      .then(function(d) { setRows(d || []); setLoading(false); })
      .catch(function(e) { setErr(e.message); setLoading(false); });
  }
  useEffect(function() { reload(); }, []);

  function handleDelete(it) {
    if (!it.rowId || it.isBase) return;
    if (!confirm("Usun\u0105\u0107 \u201E" + it.name + "\u201C?")) return;
    sbApi.deleteCatalogItem(it.rowId)
      .then(function() { setRows(function(prev) { return prev.filter(function(x) { return x.id !== it.rowId; }); }); })
      .catch(function(e) { alert("B\u0142\u0105d: " + e.message); });
  }

  var baseGroups = buildBaseCatalog();
  var groups = mergeCatalog(baseGroups, rows);
  var groupOpts = baseGroups.map(function(g) { return { id: g.id, label: g.label }; });

  var q = search.trim().toLowerCase();
  var totalItems = groups.reduce(function(a, gr) { return a + gr.items.length; }, 0);
  var fabG = groups.find(function(gr) { return gr.id === "tkaniny"; });
  var noHeightCount = fabG ? fabG.items.filter(function(it) { return it.warn; }).length : 0;

  var catTabs = [{ id: "all", label: "Wszystkie", icon: "\uD83D\uDCC1" }].concat(
    groups.map(function(gr) { return { id: gr.id, label: gr.label, icon: gr.icon }; })
  );

  // ── Producenci w aktywnej kategorii (kafelki podrzędne po wejściu np. w Tkaniny) ──
  var activeGroupForMeta = activeCat !== "all" ? groups.find(function(gr) { return gr.id === activeCat; }) : null;
  var producers = activeGroupForMeta
    ? Array.from(new Set(activeGroupForMeta.items.map(function(it) { return it.meta; }).filter(Boolean))).sort()
    : [];

  var rendered = groups
    .filter(function(gr) { return activeCat === "all" || gr.id === activeCat; })
    .map(function(gr) {
      var items = gr.items.filter(function(it) {
        if (onlyNoH && !it.warn) return false;
        if (activeMeta && it.meta !== activeMeta) return false;
        if (q) return (it.name || "").toLowerCase().includes(q) || (it.meta || "").toLowerCase().includes(q) || gr.label.toLowerCase().includes(q);
        return true;
      });
      return { group: gr, items: items };
    }).filter(function(x) { return x.items.length > 0; });

  return ce("div", null,
    ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 } },
      ce("div", null,
        ce("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)" } }, "\uD83D\uDCD1 Katalog produkt\u00f3w"),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } },
          totalItems + " pozycji cennikowych" + (noHeightCount > 0 ? " \u00B7 \u26A0\uFE0F " + noHeightCount + " tkanin bez wysoko\u015bci" : ""))
      ),
      ce("button", { onClick: function() { setEditItem({ groupId: "inne" }); },
        style: btn({ padding: "10px 18px", background: "var(--violet)", color: "#fff", display: "flex", alignItems: "center", gap: 6 }) },
        ce("span", { style: { fontSize: 16 } }, "+"), "Dodaj produkt")
    ),

    ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 18 } },
      catTabs.map(function(c) {
        var count = c.id === "all" ? totalItems : (groups.find(function(gr) { return gr.id === c.id; }) || { items: [] }).items.length;
        var active = activeCat === c.id;
        return ce("button", { key: c.id, onClick: function() { setActiveCat(c.id); setActiveMeta(null); },
          style: { padding: "14px 16px", borderRadius: 14, border: "1.5px solid " + (active ? "var(--violet)" : "var(--bd2)"), background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t3)", fontSize: 14, fontWeight: active ? 700 : 500, cursor: "pointer", display: "flex", gap: 9, alignItems: "center", width: "100%", boxSizing: "border-box" } },
          ce("span", { style: { fontSize: 20, flexShrink: 0 } }, c.icon),
          ce("span", { style: { flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.label),
          ce("span", { style: { background: active ? "rgba(124,58,237,0.15)" : "var(--bd2)", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 700, flexShrink: 0 } }, count));
      })
    ),

    producers.length > 1 && ce("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 } },
      ce("button", { onClick: function() { setActiveMeta(null); },
        style: { padding: "8px 14px", borderRadius: 20, border: "1.5px solid " + (!activeMeta ? "var(--violet)" : "var(--bd2)"), background: !activeMeta ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: !activeMeta ? "var(--violet)" : "var(--t3)", fontSize: 12.5, fontWeight: !activeMeta ? 700 : 500, cursor: "pointer" } },
        "Wszyscy producenci"),
      producers.map(function(prod) {
        var act = activeMeta === prod;
        return ce("button", { key: prod, onClick: function() { setActiveMeta(prod); },
          style: { padding: "8px 14px", borderRadius: 20, border: "1.5px solid " + (act ? "var(--violet)" : "var(--bd2)"), background: act ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: act ? "var(--violet)" : "var(--t3)", fontSize: 12.5, fontWeight: act ? 700 : 500, cursor: "pointer" } },
          prod);
      })
    ),

    ce("div", { style: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" } },
      ce("input", { value: search, onChange: function(e) { setSearch(e.target.value); }, placeholder: "\uD83D\uDD0D Szukaj produktu, producenta...",
        style: Object.assign({}, inp, { flex: 1, minWidth: 180 }) }),
      noHeightCount > 0 && ce("button", { onClick: function() { setOnlyNoH(!onlyNoH); },
        style: { padding: "9px 14px", borderRadius: 10, border: "1.5px solid " + (onlyNoH ? "#d97706" : "var(--bd2)"), background: onlyNoH ? "rgba(217,119,6,0.10)" : "var(--bg2)", color: onlyNoH ? "#d97706" : "var(--t3)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" } },
        "\u26A0\uFE0F Bez wysoko\u015bci (" + noHeightCount + ")")
    ),

    err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: 12, fontSize: 13, color: "#b91c1c", marginBottom: 14 } }, err),
    loading && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } }, "\u23F3 \u0141adowanie..."),

    !loading && rendered.length === 0 && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } },
      ce("div", { style: { fontSize: 36, marginBottom: 10 } }, "\uD83D\uDD0D"),
      ce("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--t1)" } }, "Brak pasuj\u0105cych produkt\u00f3w")
    ),

    !loading && rendered.map(function(x) {
      var gr = x.group;
      return ce("div", { key: gr.id, style: { marginBottom: 22 } },
        ce("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: "1.5px solid var(--bd2)" } },
          ce("span", { style: { fontSize: 16 } }, gr.icon),
          ce("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--t1)" } }, gr.label),
          ce("span", { style: { background: "var(--bd2)", color: "var(--t3)", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 } }, x.items.length)
        ),
        ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 } },
          x.items.map(function(it, idx) {
            return ce("div", { key: it.rowId || it.baseKey || idx,
              style: { background: "var(--bg2)", border: "1.5px solid " + (it.warn ? "#f0c98a" : "var(--bd2)"), borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer" },
              onClick: function() { setEditItem(it); } },
              ce("div", { style: { minWidth: 0, flex: 1 } },
                ce("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                  it.name,
                  !it.isBase && ce("span", { style: { marginLeft: 6, fontSize: 9, fontWeight: 700, color: "var(--violet)", background: "rgba(124,58,237,0.10)", borderRadius: 6, padding: "1px 5px" } }, "w\u0142asny"),
                  it.overridden && ce("span", { style: { marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#0369a1", background: "rgba(3,105,161,0.10)", borderRadius: 6, padding: "1px 5px" } }, "edyt.")
                ),
                ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 2 } }, [it.meta, it.detail, it.sklad].filter(Boolean).join(" \u00B7 ") || "\u2014"),
                it.warn && ce("div", { style: { fontSize: 10, fontWeight: 700, color: "#d97706", marginTop: 2 } }, "\u26A0\uFE0F " + it.warn)
              ),
              ce("div", { style: { display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" } },
                it.belkowa != null && ce("div", { style: { fontSize: 10, color: "var(--t3)" } }, "belka " + fmtPrice(it.belkowa) + " z\u0142"),
                it.zakup != null && ce("div", { style: { fontSize: 10, color: "var(--t3)" } }, "zakup " + fmtPrice(it.zakup) + " z\u0142"),
                ce("div", { style: { fontSize: 14, fontWeight: 800, color: "var(--violet)" } }, fmtPrice(it.price) + " " + (it.unit || "z\u0142")),
                !it.isBase && ce("button", { onClick: function(e) { e.stopPropagation(); handleDelete(it); },
                  title: "Usu\u0144", style: { border: "none", background: "none", cursor: "pointer", color: "var(--t3)", fontSize: 13, opacity: 0.5, padding: "0 2px" } }, "\uD83D\uDDD1")
              )
            );
          })
        )
      );
    }),

    editItem !== null && ce(ModalCatalogItem, {
      item: editItem, groups: groupOpts,
      onSave: function() { setEditItem(null); reload(); },
      onClose: function() { setEditItem(null); }
    })
  );
}

// ── Ekran główny Magazyn ──────────────────────────────────────────────────────
export function ScreenWarehouse(p) {
  var s1 = useState("warehouse"); var tab = s1[0]; var setTab = s1[1];

  var tabs = [
    { id: "warehouse", label: "Magazyn", icon: "\uD83D\uDCE6" },
    { id: "catalog",   label: "Katalog", icon: "\uD83D\uDCD1" },
    { id: "rails",     label: "Szyny KS \u2014 \u015bcinki", icon: "\uD83D\uDCCF" }
  ];

  return ce("div", { style: { padding: "0 4px" } },
    ce("div", { style: { display: "flex", gap: 6, marginBottom: 20, borderBottom: "2px solid var(--bd2)", paddingBottom: 0 } },
      tabs.map(function(t) {
        var active = tab === t.id;
        return ce("button", { key: t.id, onClick: function() { setTab(t.id); },
          style: { padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "var(--violet)" : "var(--t3)", borderBottom: active ? "2px solid var(--violet)" : "2px solid transparent", marginBottom: -2, transition: "all .15s" } },
          t.icon + " " + t.label);
      })
    ),
    tab === "warehouse" ? ce(TabWarehouse, {})
      : tab === "catalog" ? ce(TabCatalog, {})
      : ce(TabRails, {})
  );
}// ── Zakładka: Szyny KS ───────────────────────────────────────────────────────
