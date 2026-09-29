import React, { useState } from 'react';
import { sbApi } from '../lib/supabase.js';
import {
  CATALOG_FIELDS, CATALOG_GROUPS, SERVICE_FIELDS, readTableFile, guessMapping,
  buildCatalogRows, buildServiceRows, planUpsert, normalizeInsert, templateCSV
} from '../lib/catalogImport.js';
const ce = React.createElement;

var inp = { fontSize: 13, border: "1.5px solid var(--bd2)", borderRadius: 9, background: "var(--bg)", color: "var(--t1)", padding: "8px 10px", width: "100%", boxSizing: "border-box", outline: "none" };
var btn = function(extra) { return Object.assign({ border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "10px 18px" }, extra); };
var lbl = { fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 };

function downloadTemplate(kind) {
  var blob = new Blob([templateCSV(kind)], { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = kind === "uslugi" ? "szablon-cennik-uslug.csv" : "szablon-katalog.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

// p.mode: "catalog" (tkaniny/tapety/inne -> catalog_items) | "services" (cennik uslug -> tenant_price_lists)
// p.existing: aktualne wiersze catalog_items (do aktualizacji po nazwie)
// p.onDone: wywolywane po udanym zapisie (odswiez liste)
export function ModalCatalogImport(p) {
  var isServices = p.mode === "services";
  var fields = isServices ? SERVICE_FIELDS : CATALOG_FIELDS;
  var s1 = useState("file");  var step = s1[0];   var setStep = s1[1];       // file | map | preview | done
  var s2 = useState(null);    var table = s2[0];  var setTable = s2[1];       // {headers, rows}
  var s3 = useState({});      var mapping = s3[0]; var setMapping = s3[1];
  var s4 = useState(isServices ? "" : (p.defaultGroup || "tkaniny")); var group = s4[0]; var setGroup = s4[1];
  var s5 = useState("");      var listTitle = s5[0]; var setListTitle = s5[1];
  var s6 = useState("");      var err = s6[0];    var setErr = s6[1];
  var s7 = useState(false);   var busy = s7[0];   var setBusy = s7[1];
  var s8 = useState(null);    var result = s8[0]; var setResult = s8[1];
  var s9 = useState(true);    var updateExisting = s9[0]; var setUpdateExisting = s9[1];

  function onFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    setErr(""); setBusy(true);
    readTableFile(f).then(function(rows) {
      setBusy(false);
      if (rows.length < 2) { setErr("Plik nie zawiera danych (potrzebny nagłówek i co najmniej jeden wiersz)."); return; }
      var headers = rows[0].map(function(h) { return String(h == null ? "" : h).trim(); });
      setTable({ headers: headers, rows: rows.slice(1), fileName: f.name });
      setMapping(guessMapping(headers, fields));
      if (isServices && !listTitle) setListTitle(f.name.replace(/\.[^.]+$/, ""));
      setStep("map");
    }).catch(function(ex) { setBusy(false); setErr(ex.message || "Nie udało się odczytać pliku."); });
  }

  var reqMissing = fields.filter(function(f) { return f.required && !(mapping[f.key] >= 0); });

  var grpInfo = CATALOG_GROUPS.find(function(g) { return g.id === group; }) || CATALOG_GROUPS[0];
  var plan = null;
  if (table && step !== "file") {
    plan = isServices
      ? buildServiceRows(table.rows, mapping).map(function(b) { return Object.assign({}, b, { action: b.errors.length ? "skip" : "insert" }); })
      : planUpsert(buildCatalogRows(table.rows, mapping, { groupId: group, defaultUnit: grpInfo.defaultUnit }), p.existing, group)
          .map(function(b) { return (b.action === "update" && !updateExisting) ? Object.assign({}, b, { action: "skip", errors: b.errors.concat(["Już istnieje (aktualizacja wyłączona)"]) }) : b; });
  }
  var counts = { insert: 0, update: 0, skip: 0 };
  (plan || []).forEach(function(r) { counts[r.action]++; });

  function run() {
    setBusy(true); setErr("");
    var ins = plan.filter(function(r) { return r.action === "insert"; });
    var upd = plan.filter(function(r) { return r.action === "update"; });
    var op;
    if (isServices) {
      if (!listTitle.trim()) { setBusy(false); setErr("Podaj nazwę cennika."); return; }
      op = sbApi.addPriceList(listTitle.trim(), ins.map(function(r) { return r.payload; }));
    } else {
      // Wstawianie porcjami po 200, aktualizacje po jednej — pojedynczy blad nie ubija calego importu.
      var chunks = [];
      for (var i = 0; i < ins.length; i += 200) chunks.push(ins.slice(i, i + 200));
      op = chunks.reduce(function(chain, ch) {
        return chain.then(function() { return sbApi.bulkAddCatalogItems(ch.map(function(r) { return normalizeInsert(r.payload); })); });
      }, Promise.resolve()).then(function() {
        return Promise.all(upd.map(function(r) {
          var body = Object.assign({}, r.payload); delete body.group_id; delete body.base_key; delete body.name;
          return sbApi.updateCatalogItem(r.rowId, body);
        }));
      });
    }
    op.then(function() {
      setBusy(false); setResult({ inserted: ins.length, updated: upd.length, skipped: counts.skip }); setStep("done");
      if (p.onDone) p.onDone();
    }).catch(function(ex) { setBusy(false); setErr("Błąd zapisu: " + (ex.message || ex)); });
  }

  var th = { padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "var(--t3)", textAlign: "left", background: "var(--bg2)", borderBottom: "0.5px solid var(--bd2)", position: "sticky", top: 0 };
  var td = { padding: "6px 8px", fontSize: 12, color: "var(--t1)", borderBottom: "0.5px solid var(--bd3)", verticalAlign: "top" };
  var previewCols = isServices ? ["service", "net", "client"] : ["name", "price", "purchase_price", "unit", "meta", "height_cm"];

  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 },
      onClick: function(e) { if (e.target === e.currentTarget && !busy) p.onClose(); } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 16, padding: 24, width: "min(760px, 96vw)", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--bd2)", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" } },
      ce("div", { style: { fontSize: 16, fontWeight: 700, color: "var(--t1)", marginBottom: 4 } },
        isServices ? "📥 Import cennika usług" : "📥 Import katalogu / cennika"),
      ce("div", { style: { fontSize: 12, color: "var(--t3)", marginBottom: 16 } },
        step === "file" ? "1/3 — wybierz plik" : step === "map" ? "2/3 — dopasuj kolumny" : step === "preview" ? "3/3 — sprawdź i zaimportuj" : "Gotowe"),

      err && ce("div", { style: { background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", color: "#b91c1c", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 } }, err),

      step === "file" && ce("div", null,
        !isServices && ce("div", { style: { marginBottom: 14 } },
          ce("div", { style: lbl }, "Do jakiej grupy importujemy"),
          ce("select", { value: group, onChange: function(e) { setGroup(e.target.value); }, style: inp },
            CATALOG_GROUPS.map(function(g) { return ce("option", { key: g.id, value: g.id }, g.label); }))),
        ce("div", { style: { border: "2px dashed var(--bd2)", borderRadius: 12, padding: 24, textAlign: "center", marginBottom: 12 } },
          ce("div", { style: { fontSize: 13, color: "var(--t2)", marginBottom: 10 } }, "Plik CSV lub XLSX (pierwszy arkusz, pierwszy wiersz = nagłówki)"),
          ce("input", { type: "file", accept: ".csv,.txt,.xlsx", onChange: onFile, disabled: busy }),
          busy && ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 8 } }, "Odczyt pliku…")),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", lineHeight: 1.6 } },
          "Kolumny są rozpoznawane automatycznie po nazwach (np. „Cena”, „Zakup”, „Szerokość”, „Skład”) i można je poprawić w następnym kroku. ",
          "Liczby mogą mieć przecinek lub kropkę. ",
          ce("button", { onClick: function() { downloadTemplate(isServices ? "uslugi" : "katalog"); }, style: { background: "none", border: "none", color: "var(--violet)", cursor: "pointer", fontWeight: 700, padding: 0, fontSize: 12 } }, "Pobierz szablon (CSV)"))
      ),

      step === "map" && table && ce("div", null,
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginBottom: 12 } }, table.fileName + " · " + table.rows.length + " wierszy danych"),
        isServices && ce("div", { style: { marginBottom: 12 } },
          ce("div", { style: lbl }, "Nazwa cennika"),
          ce("input", { value: listTitle, onChange: function(e) { setListTitle(e.target.value); }, style: inp })),
        ce("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 } },
          fields.map(function(f) {
            return ce("div", { key: f.key },
              ce("div", { style: lbl }, f.label + (f.required ? " *" : "")),
              ce("select", { value: mapping[f.key] != null ? mapping[f.key] : -1,
                onChange: function(e) { var v = parseInt(e.target.value, 10); setMapping(function(m) { var n = Object.assign({}, m); n[f.key] = v; return n; }); },
                style: Object.assign({}, inp, f.required && !(mapping[f.key] >= 0) ? { borderColor: "#dc2626" } : {}) },
                ce("option", { value: -1 }, "— nie importuj —"),
                table.headers.map(function(h, i) { return ce("option", { key: i, value: i }, (h || "(kolumna " + (i + 1) + ")") + (table.rows[0] && table.rows[0][i] !== "" ? "  ·  np. " + String(table.rows[0][i]).slice(0, 24) : "")); })));
          })),
        ce("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
          ce("button", { onClick: function() { setStep("file"); setTable(null); }, style: btn({ background: "var(--bg2)", color: "var(--t2)" }) }, "Wstecz"),
          ce("button", { disabled: reqMissing.length > 0, onClick: function() { setStep("preview"); },
            style: btn({ background: "var(--violet)", color: "#fff", opacity: reqMissing.length ? 0.5 : 1 }) }, "Dalej"))
      ),

      step === "preview" && plan && ce("div", null,
        ce("div", { style: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, marginBottom: 10 } },
          ce("span", { style: { color: "#059669", fontWeight: 700 } }, "➕ nowe: " + counts.insert),
          !isServices && ce("span", { style: { color: "#b45309", fontWeight: 700 } }, "✏️ aktualizacje: " + counts.update),
          ce("span", { style: { color: counts.skip ? "#dc2626" : "var(--t3)", fontWeight: 700 } }, "⛔ pominięte: " + counts.skip)),
        !isServices && ce("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--t2)", marginBottom: 10, cursor: "pointer" } },
          ce("input", { type: "checkbox", checked: updateExisting, onChange: function(e) { setUpdateExisting(e.target.checked); } }),
          "Aktualizuj pozycje o tej samej nazwie (uzupełnia tylko kolumny obecne w pliku)"),
        ce("div", { style: { maxHeight: 320, overflow: "auto", border: "0.5px solid var(--bd2)", borderRadius: 10, marginBottom: 14 } },
          ce("table", { style: { width: "100%", borderCollapse: "collapse" } },
            ce("thead", null, ce("tr", null,
              ce("th", { style: th }, "#"), ce("th", { style: th }, "Akcja"),
              previewCols.map(function(c) { return ce("th", { key: c, style: th }, c); }),
              ce("th", { style: th }, "Uwagi"))),
            ce("tbody", null, plan.slice(0, 200).map(function(r) {
              var note = r.errors.concat(r.warnings).join("; ");
              return ce("tr", { key: r.line, style: { background: r.action === "skip" ? "rgba(220,38,38,0.06)" : "transparent" } },
                ce("td", { style: td }, r.line),
                ce("td", { style: td }, r.action === "insert" ? "nowa" : r.action === "update" ? "aktual." : "pomiń"),
                previewCols.map(function(c) { return ce("td", { key: c, style: td }, r.payload[c] == null ? "" : String(r.payload[c])); }),
                ce("td", { style: Object.assign({}, td, { color: r.errors.length ? "#b91c1c" : "#b45309" }) }, note));
            })))),
          plan.length > 200 && ce("div", { style: { fontSize: 11, color: "var(--t3)", padding: 8 } }, "Podgląd: pierwsze 200 z " + plan.length + " wierszy."),
        ce("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
          ce("button", { disabled: busy, onClick: function() { setStep("map"); }, style: btn({ background: "var(--bg2)", color: "var(--t2)" }) }, "Wstecz"),
          ce("button", { disabled: busy || counts.insert + counts.update === 0, onClick: run,
            style: btn({ background: "var(--violet)", color: "#fff", opacity: busy || counts.insert + counts.update === 0 ? 0.5 : 1 }) },
            busy ? "Zapisywanie…" : "Zaimportuj " + (counts.insert + counts.update) + " pozycji"))
      ),

      step === "done" && result && ce("div", null,
        ce("div", { style: { fontSize: 14, color: "var(--t1)", marginBottom: 16, lineHeight: 1.7 } },
          "✅ Dodano: ", ce("strong", null, result.inserted),
          !isServices ? [" · zaktualizowano: ", ce("strong", { key: "u" }, result.updated)] : null,
          result.skipped ? " · pominięto: " + result.skipped : ""),
        ce("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ce("button", { onClick: p.onClose, style: btn({ background: "var(--violet)", color: "#fff" }) }, "Zamknij")))
    ));
}
