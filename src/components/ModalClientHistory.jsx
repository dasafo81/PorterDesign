import React, { useState, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';

var ce = React.createElement;

// ── HISTORIA WERSJI KLIENTA ──────────────────────────────────────────────────
// Czyta client_snapshots (trigger trg_clients_snapshot, migracja 0040).
// Kazdy wiersz to stan `rooms` SPRZED danej zmiany, wiec "Przywroc" cofa wycene
// do wybranego momentu. Samo przywrocenie tez przechodzi przez updateClient,
// wiec biezacy (zly) stan trafia do historii jako nowa wersja — operacja jest
// odwracalna w obie strony.
export function ModalClientHistory(p) {
  // p.clientId, p.clientName, p.currentCount, p.onRestore(snapshotRow), p.onClose
  var sRows = useState(null), rows = sRows[0], setRows = sRows[1];
  var sErr = useState(""), err = sErr[0], setErr = sErr[1];
  var sBusy = useState(null), busyId = sBusy[0], setBusyId = sBusy[1];
  var sConfirm = useState(null), confirmRow = sConfirm[0], setConfirmRow = sConfirm[1];

  useEffect(function () {
    sbApi.getClientSnapshots(p.clientId).then(function (r) {
      setRows(Array.isArray(r) ? r : []);
    }).catch(function (e) {
      setErr((e && e.message) || "Nie uda\u0142o si\u0119 wczyta\u0107 historii.");
      setRows([]);
    });
  }, [p.clientId]);

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso; }
  }

  function relative(iso) {
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 90) return "przed chwil\u0105";
    if (diff < 3600) return Math.round(diff / 60) + " min temu";
    if (diff < 86400) return Math.round(diff / 3600) + " godz. temu";
    return Math.round(diff / 86400) + " dni temu";
  }

  function doRestore(row) {
    setBusyId(row.id);
    sbApi.getClientSnapshot(row.id).then(function (full) {
      if (!full || !full.snapshot) throw new Error("Wersja jest pusta.");
      p.onRestore(full);
      setBusyId(null);
      setConfirmRow(null);
      p.onClose();
    }).catch(function (e) {
      setErr((e && e.message) || "Nie uda\u0142o si\u0119 przywr\u00f3ci\u0107 wersji.");
      setBusyId(null);
      setConfirmRow(null);
    });
  }

  var body;
  if (rows === null) {
    body = ce("div", { style: { fontSize: 13, color: "var(--t3)", textAlign: "center", padding: "28px 0" } }, "Wczytywanie historii\u2026");
  } else if (rows.length === 0) {
    body = ce("div", { style: { fontSize: 13, color: "var(--t3)", textAlign: "center", padding: "24px 0", lineHeight: 1.6 } },
      "Brak zapisanych wersji.",
      ce("br", null),
      ce("span", { style: { fontSize: 12 } }, "Historia zaczyna si\u0119 od pierwszej zmiany wyceny po w\u0142\u0105czeniu zapisu wersji.")
    );
  } else {
    body = ce("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: "48vh", overflowY: "auto" } },
      rows.map(function (r) {
        var delta = p.currentCount != null ? (r.product_count - p.currentCount) : null;
        return ce("div", {
          key: r.id,
          style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: "var(--bg2)", border: "1px solid var(--bd3)", borderRadius: 10 }
        },
          ce("div", { style: { flex: 1, minWidth: 0 } },
            ce("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)" } }, fmtDate(r.created_at)),
            ce("div", { style: { fontSize: 11, color: "var(--t3)", marginTop: 2 } },
              relative(r.created_at) + " \u00b7 " + r.product_count + " prod." +
              (delta !== null && delta !== 0 ? " (" + (delta > 0 ? "+" + delta : delta) + " vs teraz)" : "") +
              (r.changed_by && r.changed_by !== "system" ? " \u00b7 " + r.changed_by : "")
            )
          ),
          ce("button", {
            onClick: function () { setConfirmRow(r); },
            disabled: busyId === r.id,
            style: { border: "1px solid var(--bd2)", background: "var(--bg)", color: "var(--t2)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "7px 13px", borderRadius: 8, whiteSpace: "nowrap" }
          }, busyId === r.id ? "\u2026" : "Przywr\u00f3\u0107")
        );
      })
    );
  }

  return ce("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "16px" } },
    ce("div", { style: { background: "var(--bg)", borderRadius: 18, padding: "1.6rem", width: 460, maxWidth: "100%", border: "1px solid var(--bd2)", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" } },
      ce("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)", marginBottom: 4 } }, "Historia wersji"),
      ce("div", { style: { fontSize: 12, color: "var(--t3)", marginBottom: 16, lineHeight: 1.5 } },
        p.clientName + (p.currentCount != null ? " \u00b7 obecnie " + p.currentCount + " prod." : "")
      ),
      err ? ce("div", { style: { fontSize: 12, color: "var(--red)", marginBottom: 12, lineHeight: 1.5 } }, err) : null,
      body,
      confirmRow ? ce("div", { style: { marginTop: 14, padding: "13px 15px", background: "var(--grl)", border: "1px solid var(--grm)", borderRadius: 10 } },
        ce("div", { style: { fontSize: 13, color: "var(--t1)", lineHeight: 1.6, marginBottom: 12 } },
          "Przywr\u00f3ci\u0107 wersj\u0119 z ",
          ce("strong", null, fmtDate(confirmRow.created_at)),
          " (", confirmRow.product_count, " prod.)?",
          ce("br", null),
          ce("span", { style: { fontSize: 12, color: "var(--t2)" } },
            "Obecny stan zostanie zapisany w historii, wi\u0119c operacj\u0119 mo\u017cna cofn\u0105\u0107."
          )
        ),
        ce("div", { style: { display: "flex", gap: 8 } },
          ce("button", {
            onClick: function () { doRestore(confirmRow); },
            disabled: busyId != null,
            style: { flex: 1, border: "none", background: "var(--t1)", color: "var(--bg)", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 9 }
          }, busyId != null ? "Przywracanie\u2026" : "Tak, przywr\u00f3\u0107"),
          ce("button", {
            onClick: function () { setConfirmRow(null); },
            style: { flex: 1, border: "1px solid var(--bd2)", background: "transparent", color: "var(--t2)", cursor: "pointer", fontSize: 13, fontWeight: 500, padding: "10px 14px", borderRadius: 9 }
          }, "Anuluj")
        )
      ) : null,
      ce("button", {
        onClick: p.onClose,
        style: { marginTop: 16, width: "100%", border: "1px solid var(--bd2)", background: "transparent", color: "var(--t2)", cursor: "pointer", fontSize: 13, fontWeight: 500, padding: "11px 14px", borderRadius: 10 }
      }, "Zamknij")
    )
  );
}
