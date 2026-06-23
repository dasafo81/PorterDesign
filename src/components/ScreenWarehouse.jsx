import React, { useState, useEffect } from 'react';
import { sbApi } from '../lib/supabase.js';
const ce = React.createElement;

// ── Kategorie ────────────────────────────────────────────────────────────────
var CATEGORIES = [
  { id: "all",       label: "Wszystko", icon: "\uD83D\uDCE6" },
  { id: "tkanina",   label: "Tkaniny",  icon: "\uD83E\uDDF5" },
  { id: "mechanizm", label: "Mechanizmy/Akcesoria", icon: "\u2699\uFE0F" },
  { id: "gotowy",    label: "Gotowe produkty", icon: "\uD83E\uDE9F" },
  { id: "probnik",   label: "Próbniki/Katalogi", icon: "\uD83D\uDCD6" },
  { id: "szyna",     label: "Szyny KS", icon: "\uD83D\uDCCF" }
];

var UNITS = { tkanina: "mb", mechanizm: "szt", gotowy: "szt", probnik: "szt", szyna: "szt" };
var LOW_STOCK = { tkanina: 3, mechanizm: 5, gotowy: 1, probnik: 1, szyna: 2 };

// ── Utilities ────────────────────────────────────────────────────────────────
function stockBadge(item) {
  var qty = +(item.quantity || 0);
  var low = LOW_STOCK[item.category] || 2;
  if (qty === 0) return { label: "Brak", color: "#dc2626", bg: "rgba(220,38,38,0.10)" };
  if (qty <= low) return { label: "Mało", color: "#d97706", bg: "rgba(217,119,6,0.10)" };
  return { label: "OK", color: "#059669", bg: "rgba(5,150,105,0.10)" };
}

function catLabel(id) {
  var c = CATEGORIES.find(function(x) { return x.id === id; });
  return c ? c.label : id;
}

// ── Modal dodaj/edytuj ───────────────────────────────────────────────────────
function ModalWarehouseItem(p) {
  // p: { item (null = new), onSave, onClose }
  var isNew = !p.item || !p.item.id;
  var def = p.item || {};

  var s1 = useState(def.name || "");         var name = s1[0]; var setName = s1[1];
  var s2 = useState(def.category || "tkanina"); var cat = s2[0]; var setCat = s2[1];
  var s3 = useState(String(def.quantity || "0")); var qty = s3[0]; var setQty = s3[1];
  var s4 = useState(def.unit || "mb");        var unit = s4[0]; var setUnit = s4[1];
  var s5 = useState(def.color || "");         var color = s5[0]; var setColor = s5[1];
  var s6 = useState(def.supplier || "");      var supplier = s6[0]; var setSupplier = s6[1];
  var s7 = useState(def.location || "");      var location = s7[0]; var setLocation = s7[1];
  var s8 = useState(def.notes || "");         var notes = s8[0]; var setNotes = s8[1];
  var s9 = useState(def.length_cm || "");     var lenCm = s9[0]; var setLenCm = s9[1];
  var s10 = useState(false);                  var busy = s10[0]; var setBusy = s10[1];
  var s11 = useState(null);                   var err = s11[0]; var setErr = s11[1];

  // Sync unit when category changes
  useEffect(function() { setUnit(UNITS[cat] || "szt"); }, [cat]);

  function save() {
    if (!name.trim()) { setErr("Podaj nazwę"); return; }
    setBusy(true); setErr(null);
    var payload = {
      name: name.trim(), category: cat, quantity: parseFloat(qty) || 0,
      unit: unit, color: color.trim(), supplier: supplier.trim(),
      location: location.trim(), notes: notes.trim(),
      length_cm: cat === "szyna" ? (parseInt(lenCm) || null) : null
    };
    var prom = isNew ? sbApi.addWarehouseItem(payload) : sbApi.updateWarehouseItem(p.item.id, payload);
    prom.then(function() { p.onSave(); }).catch(function(e) { setErr(e.message || "Błąd zapisu"); setBusy(false); });
  }

  var inp = { fontSize: 13, border: "1.5px solid var(--bd2)", borderRadius: 9, background: "var(--bg)", color: "var(--t1)", padding: "9px 12px", width: "100%", boxSizing: "border-box", outline: "none" };

  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 18, padding: "24px 22px", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.20)" } },
      ce("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
        ce("div", { style: { fontSize: 16, fontWeight: 700 } }, isNew ? "Nowa pozycja" : "Edytuj pozycję"),
        ce("button", { onClick: p.onClose, style: { border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--t3)" } }, "\u00D7")
      ),
      err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#b91c1c", marginBottom: 12 } }, "\u26A0\uFE0F " + err),

      // Kategoria
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Kategoria"),
        ce("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
          CATEGORIES.filter(function(c) { return c.id !== "all"; }).map(function(c) {
            var active = cat === c.id;
            return ce("button", { key: c.id, onClick: function() { setCat(c.id); },
              style: { padding: "6px 12px", borderRadius: 8, border: active ? "1.5px solid var(--violet)" : "1.5px solid var(--bd2)", background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t2)", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer" } },
              c.icon + " " + c.label);
          })
        )
      ),

      // Nazwa
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Nazwa *"),
        ce("input", { value: name, onChange: function(e) { setName(e.target.value); }, placeholder: cat === "tkanina" ? "np. Velvet Monaco" : cat === "szyna" ? "np. KS Silent 19mm" : "Nazwa...", style: inp })
      ),

      // Ilość + jednostka
      ce("div", { style: { display: "flex", gap: 10, marginBottom: 12 } },
        ce("div", { style: { flex: 2 } },
          ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Ilość"),
          ce("input", { type: "number", min: "0", step: cat === "tkanina" ? "0.5" : "1", value: qty, onChange: function(e) { setQty(e.target.value); }, style: inp })
        ),
        ce("div", { style: { flex: 1 } },
          ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Jednostka"),
          ce("input", { value: unit, onChange: function(e) { setUnit(e.target.value); }, style: inp })
        )
      ),

      // Długość (tylko szyny KS)
      cat === "szyna" && ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "D\u0142ugo\u015b\u0107 [cm]"),
        ce("input", { type: "number", min: "0", value: lenCm, onChange: function(e) { setLenCm(e.target.value); }, placeholder: "np. 350", style: inp })
      ),

      // Kolor
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Kolor / wariant"),
        ce("input", { value: color, onChange: function(e) { setColor(e.target.value); }, placeholder: "np. Beige 02, srebrny...", style: inp })
      ),

      // Dostawca
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Dostawca / producent"),
        ce("input", { value: supplier, onChange: function(e) { setSupplier(e.target.value); }, placeholder: "np. Linia Dekor, Kier...", style: inp })
      ),

      // Lokalizacja
      ce("div", { style: { marginBottom: 12 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Lokalizacja w magazynie"),
        ce("input", { value: location, onChange: function(e) { setLocation(e.target.value); }, placeholder: "np. Regał A, pó\u0142ka 2...", style: inp })
      ),

      // Uwagi
      ce("div", { style: { marginBottom: 20 } },
        ce("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 } }, "Uwagi"),
        ce("textarea", { value: notes, onChange: function(e) { setNotes(e.target.value); }, placeholder: "Dodatkowe informacje...", rows: 2, style: Object.assign({}, inp, { resize: "vertical", lineHeight: 1.5 }) })
      ),

      ce("div", { style: { display: "flex", gap: 10 } },
        ce("button", { onClick: p.onClose, style: { flex: 1, padding: "12px", borderRadius: 10, border: "1.5px solid var(--bd2)", background: "var(--bg2)", color: "var(--t2)", fontSize: 13, fontWeight: 600, cursor: "pointer" } }, "Anuluj"),
        ce("button", { onClick: save, disabled: busy, style: { flex: 2, padding: "12px", borderRadius: 10, border: "none", background: "var(--violet)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 } }, busy ? "Zapisuję..." : (isNew ? "+ Dodaj" : "Zapisz"))
      )
    )
  );
}

// ── Karta pozycji ────────────────────────────────────────────────────────────
function WarehouseCard(p) {
  // p: { item, onEdit, onDelete, onAdjust }
  var item = p.item;
  var badge = stockBadge(item);
  var cat = CATEGORIES.find(function(c) { return c.id === item.category; }) || { icon: "\uD83D\uDCE6" };

  return ce("div", {
    style: {
      background: "var(--bg2)", border: "1.5px solid var(--bd2)", borderRadius: 14,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
      transition: "box-shadow .15s", cursor: "default"
    }
  },
    // Row 1: icon + name + badge
    ce("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 } },
      ce("span", { style: { fontSize: 22, lineHeight: 1, marginTop: 2 } }, cat.icon),
      ce("div", { style: { flex: 1, minWidth: 0 } },
        ce("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.name),
        ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 2 } },
          catLabel(item.category) +
          (item.color ? " \u00B7 " + item.color : "") +
          (item.supplier ? " \u00B7 " + item.supplier : "") +
          (item.category === "szyna" && item.length_cm ? " \u00B7 " + item.length_cm + " cm" : "")
        )
      ),
      ce("div", { style: { background: badge.bg, color: badge.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 } }, badge.label)
    ),

    // Row 2: quantity + adjust buttons
    ce("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      ce("div", { style: { flex: 1, display: "flex", alignItems: "baseline", gap: 4 } },
        ce("span", { style: { fontSize: 24, fontWeight: 800, color: badge.color } }, item.quantity),
        ce("span", { style: { fontSize: 12, color: "var(--t3)", fontWeight: 500 } }, item.unit || "szt")
      ),
      // Quick adjust buttons
      ce("button", { onClick: function() { p.onAdjust(item, -1); }, title: "Odejmij 1", style: { border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t2)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" } }, "\u2212"),
      ce("button", { onClick: function() { p.onAdjust(item, +1); }, title: "Dodaj 1", style: { border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t2)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" } }, "+"),
      ce("button", { onClick: function() { p.onEdit(item); }, title: "Edytuj", style: { border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t3)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" } }, "\u270F\uFE0F"),
      ce("button", { onClick: function() { p.onDelete(item); }, title: "Usuń", style: { border: "1.5px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "#dc2626", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" } }, "\uD83D\uDDD1")
    ),

    // Row 3: location + notes (optional)
    (item.location || item.notes) && ce("div", { style: { fontSize: 11, color: "var(--t3)", borderTop: "1px solid var(--bd3)", paddingTop: 6, display: "flex", gap: 8, flexWrap: "wrap" } },
      item.location && ce("span", null, "\uD83D\uDCCC " + item.location),
      item.notes && ce("span", null, "\uD83D\uDCAC " + item.notes)
    )
  );
}

// ── Główny ekran ─────────────────────────────────────────────────────────────
export function ScreenWarehouse(p) {
  var s1 = useState([]);    var items = s1[0]; var setItems = s1[1];
  var s2 = useState(true);  var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(null);  var err = s3[0]; var setErr = s3[1];
  var s4 = useState("all"); var activeCat = s4[0]; var setActiveCat = s4[1];
  var s5 = useState("");    var search = s5[0]; var setSearch = s5[1];
  var s6 = useState(null);  var editItem = s6[0]; var setEditItem = s6[1]; // null=closed, {}=new, item=edit
  var s7 = useState(false); var showLowOnly = s7[0]; var setShowLowOnly = s7[1];

  function reload() {
    setLoading(true);
    sbApi.getWarehouseItems()
      .then(function(data) { setItems(data || []); setLoading(false); })
      .catch(function(e) { setErr(e.message || "Błąd ładowania"); setLoading(false); });
  }

  useEffect(function() { reload(); }, []);

  function handleAdjust(item, delta) {
    var newQty = Math.max(0, (+(item.quantity) || 0) + delta);
    sbApi.updateWarehouseItem(item.id, { quantity: newQty })
      .then(function() {
        setItems(function(prev) {
          return prev.map(function(x) { return x.id === item.id ? Object.assign({}, x, { quantity: newQty }) : x; });
        });
      })
      .catch(function(e) { alert("Błąd aktualizacji: " + e.message); });
  }

  function handleDelete(item) {
    if (!confirm("Usunąć „" + item.name + "\" z magazynu?")) return;
    sbApi.deleteWarehouseItem(item.id)
      .then(function() { setItems(function(prev) { return prev.filter(function(x) { return x.id !== item.id; }); }); })
      .catch(function(e) { alert("Błąd usuwania: " + e.message); });
  }

  // Filtrowanie
  var filtered = items.filter(function(item) {
    if (activeCat !== "all" && item.category !== activeCat) return false;
    if (showLowOnly) {
      var b = stockBadge(item);
      if (b.label === "OK") return false;
    }
    if (search.trim()) {
      var q = search.toLowerCase();
      return (item.name || "").toLowerCase().includes(q) ||
             (item.color || "").toLowerCase().includes(q) ||
             (item.supplier || "").toLowerCase().includes(q) ||
             (item.notes || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Statystyki
  var lowCount = items.filter(function(x) { var b = stockBadge(x); return b.label !== "OK"; }).length;

  return ce("div", { style: { padding: "0 4px" } },

    // Header
    ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" } },
      ce("div", null,
        ce("div", { style: { fontSize: 20, fontWeight: 800, color: "var(--t1)" } }, "\uD83D\uDCE6 Magazyn"),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } }, items.length + " pozycji" + (lowCount > 0 ? " \u00B7 \u26A0\uFE0F " + lowCount + " wymaga uzupełnienia" : ""))
      ),
      ce("button", { onClick: function() { setEditItem({}); },
        style: { padding: "10px 18px", borderRadius: 12, border: "none", background: "var(--violet)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 } },
        ce("span", { style: { fontSize: 16 } }, "+"), "Dodaj pozycję"
      )
    ),

    // Search + filtr niski stan
    ce("div", { style: { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" } },
      ce("div", { style: { flex: 1, position: "relative", minWidth: 200 } },
        ce("input", {
          value: search, onChange: function(e) { setSearch(e.target.value); },
          placeholder: "\uD83D\uDD0D Szukaj po nazwie, kolorze, dostawcy...",
          style: { width: "100%", boxSizing: "border-box", padding: "9px 14px 9px 36px", borderRadius: 10, border: "1.5px solid var(--bd2)", background: "var(--bg)", color: "var(--t1)", fontSize: 13, outline: "none" }
        }),
        ce("span", { style: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" } }, "\uD83D\uDD0D")
      ),
      lowCount > 0 && ce("button", { onClick: function() { setShowLowOnly(!showLowOnly); },
        style: { padding: "9px 14px", borderRadius: 10, border: "1.5px solid " + (showLowOnly ? "#d97706" : "var(--bd2)"), background: showLowOnly ? "rgba(217,119,6,0.10)" : "var(--bg2)", color: showLowOnly ? "#d97706" : "var(--t3)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" } },
        "\u26A0\uFE0F Tylko niski stan (" + lowCount + ")"
      )
    ),

    // Category tabs
    ce("div", { style: { display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 } },
      CATEGORIES.map(function(c) {
        var count = c.id === "all" ? items.length : items.filter(function(x) { return x.category === c.id; }).length;
        var active = activeCat === c.id;
        return ce("button", { key: c.id, onClick: function() { setActiveCat(c.id); },
          style: { padding: "7px 14px", borderRadius: 10, border: "1.5px solid " + (active ? "var(--violet)" : "var(--bd2)"), background: active ? "rgba(124,58,237,0.10)" : "var(--bg2)", color: active ? "var(--violet)" : "var(--t3)", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 } },
          ce("span", null, c.icon), ce("span", null, c.label),
          ce("span", { style: { background: active ? "rgba(124,58,237,0.15)" : "var(--bd2)", color: active ? "var(--violet)" : "var(--t3)", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 700 } }, count)
        );
      })
    ),

    // Error
    err && ce("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 14 } }, "\u26A0\uFE0F " + err),

    // Loading
    loading && ce("div", { style: { textAlign: "center", padding: "60px 0", color: "var(--t3)" } }, "\u23F3 Ładowanie..."),

    // Empty state
    !loading && filtered.length === 0 && ce("div", { style: { textAlign: "center", padding: "50px 0", color: "var(--t3)" } },
      ce("div", { style: { fontSize: 36, marginBottom: 10 } }, "\uD83D\uDCE6"),
      ce("div", { style: { fontSize: 14, fontWeight: 600 } }, search || activeCat !== "all" ? "Brak pasujących pozycji" : "Magazyn jest pusty"),
      ce("div", { style: { fontSize: 12, marginTop: 6 } }, search || activeCat !== "all" ? "Zmień filtry aby zobaczyć inne pozycje" : "Kliknij + Dodaj pozycję aby dodać pierwszą")
    ),

    // Grid
    !loading && filtered.length > 0 && ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 } },
      filtered.map(function(item) {
        return ce(WarehouseCard, { key: item.id, item: item,
          onEdit: function(it) { setEditItem(it); },
          onDelete: handleDelete,
          onAdjust: handleAdjust
        });
      })
    ),

    // Modal
    editItem !== null && ce(ModalWarehouseItem, {
      item: editItem && editItem.id ? editItem : null,
      onSave: function() { setEditItem(null); reload(); },
      onClose: function() { setEditItem(null); }
    })
  );
}
