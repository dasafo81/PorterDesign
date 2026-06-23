import React, { useState, useEffect } from 'react';
import { sbApi } from '../lib/supabase.js';
const ce = React.createElement;

// ── Konfiguracja ─────────────────────────────────────────────────────────────
var CATEGORIES = [
  { id: "tkanina",   label: "Tkaniny",             icon: "\uD83E\uDDF5", unit: "mb",  lowAt: 3 },
  { id: "mechanizm", label: "Mechanizmy/Akcesoria", icon: "\u2699\uFE0F", unit: "szt", lowAt: 5 },
  { id: "gotowy",    label: "Gotowe produkty",      icon: "\uD83E\uDE9F", unit: "szt", lowAt: 1 },
  { id: "probnik",   label: "Pr\u00F3bniki/Katalogi",   icon: "\uD83D\uDCD6", unit: "szt", lowAt: 1 }
];

var RAIL_TYPES = ["Szyna KS", "Inna"];

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
  var s2 = useState(def.category || "tkanina"); var cat = s2[0]; var setCat = s2[1];
  var s3 = useState(String(def.quantity != null ? def.quantity : "0")); var qty = s3[0]; var setQty = s3[1];
  var s4 = useState(def.unit || "mb");          var unit = s4[0]; var setUnit = s4[1];
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
          ce("input", { type: "number", min: "0", step: cat === "tkanina" ? "0.5" : "1", value: qty, onChange: function(e) { setQty(e.target.value); }, style: inp })
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
function ModalScrap(p) {
  var s1 = useState("");              var len = s1[0]; var setLen = s1[1];
  var s2 = useState(RAIL_TYPES[0]);   var railType = s2[0]; var setRailType = s2[1];
  var s3 = useState("");              var color = s3[0]; var setColor = s3[1];
  var s4 = useState(false);           var busy = s4[0]; var setBusy = s4[1];
  var s5 = useState(null);            var err = s5[0]; var setErr = s5[1];

  function save() {
    var l = parseInt(len);
    if (!l || l < 1) { setErr("Podaj d\u0142ugo\u015B\u0107 w cm"); return; }
    if (!railType.trim()) { setErr("Wybierz typ szyny"); return; }
    setBusy(true); setErr(null);
    sbApi.addRailScrap({ length_cm: l, rail_type: railType.trim(), color: color.trim(), notes: "" })
      .then(function() { p.onSave(); })
      .catch(function(e) { setErr(e.message || "B\u0142\u0105d zapisu"); setBusy(false); });
  }

  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 18, padding: "24px 22px", width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.20)" } },
      ce("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
        ce("div", { style: { fontSize: 16, fontWeight: 700 } }, "\uD83D\uDCCF Nowa \u015bcinka szyny"),
        ce("button", { onClick: p.onClose, style: { border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--t3)" } }, "\u00D7")
      ),
      err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b91c1c", marginBottom: 12 } }, err),

      // Długość
      ce("div", { style: { marginBottom: 14 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "D\u0142ugo\u015B\u0107 [cm] *"),
        ce("input", { type: "number", min: "1", value: len, onChange: function(e) { setLen(e.target.value); }, placeholder: "np. 248", autoFocus: true,
          style: Object.assign({}, inp, { fontSize: 22, fontWeight: 700, textAlign: "center", padding: "12px" }) })
      ),

      // Typ szyny
      ce("div", { style: { marginBottom: 14 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Typ szyny *"),
        ce("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 } },
          RAIL_TYPES.map(function(t) {
            var active = railType === t;
            return ce("button", { key: t, onClick: function() { setRailType(t); setCustomType(false); },
              style: { padding: "6px 12px", borderRadius: 8, border: active ? "1.5px solid var(--violet)" : "1.5px solid var(--bd2)", background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t2)", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer" } }, t);
          }),
        )
      ),

      // Kolor
      ce("div", { style: { marginBottom: 20 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Kolor"),
        ce("input", { value: color, onChange: function(e) { setColor(e.target.value); }, placeholder: "np. bia\u0142y, srebrny, czarny...", style: inp })
      ),

      ce("div", { style: { display: "flex", gap: 10 } },
        ce("button", { onClick: p.onClose, style: btn({ flex: 1, padding: 12, background: "var(--bg2)", color: "var(--t2)", border: "1.5px solid var(--bd2)" }) }, "Anuluj"),
        ce("button", { onClick: save, disabled: busy, style: btn({ flex: 2, padding: 12, background: "var(--violet)", color: "#fff", opacity: busy ? 0.7 : 1 }) }, busy ? "Dodaj\u0119..." : "+ Dodaj \u015bcink\u0119")
      )
    )
  );
}

// ── Zakładka: Szyny KS ───────────────────────────────────────────────────────
function TabRails(p) {
  var s1 = useState([]);    var scraps = s1[0]; var setScraps = s1[1];
  var s2 = useState(true);  var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(null);  var err = s3[0]; var setErr = s3[1];
  var s4 = useState(false); var showModal = s4[0]; var setShowModal = s4[1];
  var s5 = useState("");    var filterType = s5[0]; var setFilterType = s5[1];
  var s6 = useState("");    var minLen = s6[0]; var setMinLen = s6[1];

  function reload() {
    setLoading(true);
    sbApi.getRailScraps()
      .then(function(data) { setScraps(data || []); setLoading(false); })
      .catch(function(e) { setErr(e.message); setLoading(false); });
  }
  useEffect(function() { reload(); }, []);

  function handleDelete(scrap) {
    if (!confirm("Usun\u0105\u0107 \u015bcink\u0119 " + scrap.length_cm + " cm?")) return;
    sbApi.deleteRailScrap(scrap.id)
      .then(function() { setScraps(function(prev) { return prev.filter(function(x) { return x.id !== scrap.id; }); }); })
      .catch(function(e) { alert("B\u0142\u0105d: " + e.message); });
  }

  // Unikalne typy szyn
  var types = [];
  scraps.forEach(function(s) { if (s.rail_type && types.indexOf(s.rail_type) === -1) types.push(s.rail_type); });
  types.sort();

  // Filtrowanie
  var filtered = scraps.filter(function(s) {
    if (filterType && s.rail_type !== filterType) return false;
    if (minLen && s.length_cm < parseInt(minLen)) return false;
    return true;
  });

  // Grupuj po typie dla wyświetlania
  var groups = {};
  filtered.forEach(function(s) {
    var key = s.rail_type || "Inne";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  return ce("div", null,
    // Nagłówek
    ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 } },
      ce("div", null,
        ce("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)" } }, "\uD83D\uDCCF \u015Acinki szyn KS"),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } }, scraps.length + " szt. na stanie \u00B7 posortowane od najd\u0142u\u017Cszej")
      ),
      ce("button", { onClick: function() { setShowModal(true); },
        style: btn({ padding: "10px 18px", background: "var(--violet)", color: "#fff", display: "flex", alignItems: "center", gap: 6 }) },
        ce("span", { style: { fontSize: 16 } }, "+"), "Dodaj \u015bcink\u0119")
    ),

    // Filtry
    ce("div", { style: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" } },
      ce("div", null,
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 4 } }, "Min. d\u0142ugo\u015B\u0107 [cm]"),
        ce("input", { type: "number", min: "0", value: minLen, onChange: function(e) { setMinLen(e.target.value); },
          placeholder: "np. 200",
          style: Object.assign({}, inp, { width: 130 }) })
      ),
      types.length > 1 && ce("div", null,
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 4 } }, "Typ szyny"),
        ce("select", { value: filterType, onChange: function(e) { setFilterType(e.target.value); },
          style: Object.assign({}, inp, { width: "auto" }) },
          ce("option", { value: "" }, "Wszystkie typy"),
          types.map(function(t) { return ce("option", { key: t, value: t }, t); })
        )
      )
    ),

    err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: 12, fontSize: 13, color: "#b91c1c", marginBottom: 14 } }, err),
    loading && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } }, "\u23F3 \u0141adowanie..."),

    !loading && filtered.length === 0 && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } },
      ce("div", { style: { fontSize: 36, marginBottom: 10 } }, "\uD83D\uDCCF"),
      ce("div", { style: { fontSize: 14, fontWeight: 600 } }, minLen || filterType ? "Brak \u015bcinek spe\u0142niaj\u0105cych kryteria" : "Brak \u015bcinek w magazynie"),
      ce("div", { style: { fontSize: 12, marginTop: 6, color: "var(--t3)" } }, minLen || filterType ? "Zmie\u0144 filtry" : "Kliknij + Dodaj \u015bcink\u0119")
    ),

    // Lista pogrupowana po typie
    !loading && Object.keys(groups).map(function(groupName) {
      var items = groups[groupName];
      return ce("div", { key: groupName, style: { marginBottom: 20 } },
        ce("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 } },
          ce("span", null, groupName),
          ce("span", { style: { background: "var(--bd2)", borderRadius: 20, padding: "1px 8px", fontSize: 11 } }, items.length + " szt.")
        ),
        ce("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          items.map(function(scrap) {
            return ce("div", { key: scrap.id,
              style: { background: "var(--bg2)", border: "1.5px solid var(--bd2)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 } },

              // Długość — główna info
              ce("div", { style: { minWidth: 80, textAlign: "center", background: "rgba(124,58,237,0.08)", borderRadius: 10, padding: "8px 12px" } },
                ce("div", { style: { fontSize: 22, fontWeight: 800, color: "var(--violet)", lineHeight: 1 } }, scrap.length_cm),
                ce("div", { style: { fontSize: 10, color: "var(--t3)", fontWeight: 600, marginTop: 2 } }, "cm")
              ),

              // Kolor + data
              ce("div", { style: { flex: 1 } },
                scrap.color && ce("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)" } }, scrap.color),
                ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 2 } },
                  "dodana: " + new Date(scrap.created_at).toLocaleDateString("pl-PL"))
              ),

              // Usuń
              ce("button", { onClick: function() { handleDelete(scrap); },
                title: "Zu\u017Cyta / usu\u0144",
                style: { border: "1.5px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "#dc2626", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 } },
                "\uD83D\uDDD1 Usu\u0144")
            );
          })
        )
      );
    }),

    showModal && ce(ModalScrap, {
      onSave: function() { setShowModal(false); reload(); },
      onClose: function() { setShowModal(false); }
    })
  );
}

// ── Zakładka: Magazyn ogólny ──────────────────────────────────────────────────
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

    ce("div", { style: { display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 } },
      allCats.map(function(c) {
        var count = c.id === "all" ? items.length : items.filter(function(x) { return x.category === c.id; }).length;
        var active = activeCat === c.id;
        return ce("button", { key: c.id, onClick: function() { setActiveCat(c.id); },
          style: { padding: "7px 14px", borderRadius: 10, border: "1.5px solid " + (active ? "var(--violet)" : "var(--bd2)"), background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t3)", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", display: "flex", gap: 5, alignItems: "center" } },
          ce("span", null, c.icon), ce("span", null, c.label),
          ce("span", { style: { background: active ? "rgba(124,58,237,0.15)" : "var(--bd2)", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 700 } }, count));
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

// ── Ekran główny Magazyn ──────────────────────────────────────────────────────
export function ScreenWarehouse(p) {
  var s1 = useState("warehouse"); var tab = s1[0]; var setTab = s1[1];

  var tabs = [
    { id: "warehouse", label: "Magazyn", icon: "\uD83D\uDCE6" },
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
    tab === "warehouse" ? ce(TabWarehouse, {}) : ce(TabRails, {})
  );
}
