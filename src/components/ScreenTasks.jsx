import React, { useState, useEffect, useRef } from 'react';
import { sbApi, SB_URL, SB_KEY } from '../lib/supabase.js';
import { refreshSession } from '../lib/auth.js';
import { gcalLogin, gcalLogout, gcalGetToken } from '../lib/gcal.js';

var ce = React.createElement;

// ── SUPABASE HELPER ─────────────────────────────────────────────────────────
// Czyta access_token zalogowanego użytkownika z localStorage (fallback do anon key).
function getUserToken() {
  try {
    var raw = localStorage.getItem("sb_session");
    if (!raw) return null;
    var s = JSON.parse(raw);
    return s && s.access_token ? s.access_token : null;
  } catch (e) { return null; }
}

function sbFetchRaw(method, path, body, tokenOverride) {
  var userTok = tokenOverride !== undefined ? tokenOverride : getUserToken();
  return fetch(SB_URL + "/rest/v1/" + path, {
    method: method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + (userTok || SB_KEY),
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { var err = new Error(t); err.status = r.status; throw err; });
    var ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) return r.json();
    return null;
  });
}

// Wrapper z auto-odswiezeniem JWT: jesli Supabase zwroci PGRST303 (JWT expired),
// odswiez sesje przez refresh_token i powtorz zapytanie raz z nowym tokenem.
// Jesli refresh_token tez wygasl, czyscimy sesje i przeladowujemy strone.
function sbFetch(method, path, body) {
  return sbFetchRaw(method, path, body).catch(function(e) {
    if (e.message && e.message.indexOf("PGRST303") !== -1) {
      return refreshSession().then(function(s) {
        if (!s || !s.access_token) {
          localStorage.removeItem("sb_session");
          window.location.reload();
          throw e;
        }
        return sbFetchRaw(method, path, body, s.access_token);
      });
    }
    throw e;
  });
}

var tasksApi = {
  getTasks: function() {
    return sbFetch("GET", "tasks?select=*&order=sort_order.asc,created_at.asc");
  },
  addTask: function(data) {
    return sbFetch("POST", "tasks", data);
  },
  updateTask: function(id, data) {
    return sbFetch("PATCH", "tasks?id=eq." + id, data);
  },
  deleteTask: function(id) {
    return sbFetch("DELETE", "tasks?id=eq." + id);
  }
};

// ── PRIORITY CONFIG ──────────────────────────────────────────────────────────
var PRIORITY = {
  low:    { label: "Niska",   color: "#94a3b8", bg: "rgba(148,163,184,0.12)", dot: "#94a3b8" },
  medium: { label: "Średnia", color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  dot: "#f59e0b" },
  high:   { label: "Wysoka",  color: "#ef4444", bg: "rgba(239,68,68,0.12)",   dot: "#ef4444" }
};

// ── OWNER CONFIG ─────────────────────────────────────────────────────────────
var OWNERS = {
  damian:  { label: "Damian",  color: "#6366f1", initials: "D" },
  paulina: { label: "Paulina", color: "#db2777", initials: "P" }
};
var OWNER_ORDER = ["damian", "paulina"];

// ── CATEGORY CONFIG ──────────────────────────────────────────────────────────
var CATEGORIES = {
  montaz:      { label: "Montaż",              color: "#f97316", icon: "🔧" },
  aplikacja:   { label: "Aplikacja",           color: "#7c3aed", icon: "💻" },
  marketing:   { label: "Marketing",           color: "#db2777", icon: "📣" },
  legal:       { label: "Dział Legalny",       color: "#64748b", icon: "⚖️" },
  sprzedaz:    { label: "Sprzedaż",            color: "#059669", icon: "💰" },
  logistyka:   { label: "Logistyka Zamówienia", color: "#2563eb", icon: "📦" },
  finanse:     { label: "Finanse / Księgowość", color: "#0d9488", icon: "📊" },
  reklamacje:  { label: "Reklamacje",          color: "#dc2626", icon: "⚠️" },
  strona:      { label: "Strona internetowa",  color: "#0ea5e9", icon: "🌐" }
};
var CAT_ORDER = ["montaz", "aplikacja", "marketing", "legal", "sprzedaz", "logistyka", "finanse", "reklamacje", "strona"];
var NONE_CAT = { label: "Pozostałe", color: "#a0a0c0", icon: "📌" };

function catIdOf(task) {
  return (task.category && CATEGORIES[task.category]) ? task.category : "__none__";
}
function catMeta(id) {
  return id === "__none__" ? NONE_CAT : (CATEGORIES[id] || NONE_CAT);
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function isOverdue(task) {
  if (!task.due_date || task.done) return false;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var due = new Date(task.due_date);
  return due < today;
}
function formatDate(str) {
  if (!str) return "";
  var d = new Date(str);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}
function pad2(n) { return String(n).padStart(2, "0"); }

// ── INLINE EDIT INPUT ────────────────────────────────────────────────────────
function QuickInput(p) {
  var ref = useRef(null);
  useEffect(function() { if (ref.current) ref.current.focus(); }, []);
  return ce("input", {
    ref: ref,
    type: "text",
    value: p.value,
    onChange: function(e) { p.onChange(e.target.value); },
    onKeyDown: function(e) {
      if (e.key === "Enter") p.onConfirm();
      if (e.key === "Escape") p.onCancel();
    },
    onBlur: p.onConfirm,
    placeholder: p.placeholder || "",
    style: Object.assign({
      border: "none", outline: "none", background: "transparent",
      fontSize: p.fontSize || 14, fontWeight: p.fontWeight || 400,
      color: "var(--t1)", fontFamily: "inherit", width: "100%",
      padding: 0
    }, p.style || {})
  });
}

// ── SUBTASK ROW ──────────────────────────────────────────────────────────────
function SubtaskRow(p) {
  var sub = p.sub;
  var s1 = useState(false); var hovering = s1[0]; var setHovering = s1[1];
  var s2 = useState(false); var editing = s2[0]; var setEditing = s2[1];
  var s3 = useState(sub.title); var editVal = s3[0]; var setEditVal = s3[1];

  function commitEdit() {
    var v = editVal.trim();
    if (v && v !== sub.title) p.onUpdate({ title: v });
    else setEditVal(sub.title);
    setEditing(false);
  }

  return ce("div", {
    onMouseEnter: function() { setHovering(true); },
    onMouseLeave: function() { setHovering(false); },
    style: {
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 8px",
      background: hovering ? "var(--bg2)" : "transparent",
      borderRadius: 7, transition: "background .12s", cursor: "default",
      opacity: sub.done ? 0.5 : 1
    }
  },
    ce("div", {
      onClick: function() { p.onUpdate({ done: !sub.done }); },
      style: {
        width: 15, height: 15, borderRadius: 4,
        border: "1.5px solid " + (sub.done ? "var(--gr)" : "var(--bd2)"),
        background: sub.done ? "var(--gr)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0, transition: "all .15s"
      }
    }, sub.done ? ce("span", { style: { color: "var(--bg)", fontSize: 9, fontWeight: 700 } }, "✓") : null),

    editing
      ? ce(QuickInput, {
          value: editVal, fontSize: 12,
          onChange: setEditVal, onConfirm: commitEdit,
          onCancel: function() { setEditVal(sub.title); setEditing(false); }
        })
      : ce("span", {
          onDoubleClick: function() { setEditing(true); },
          style: {
            flex: 1, fontSize: 12, color: "var(--t1)", lineHeight: 1.35,
            textDecoration: sub.done ? "line-through" : "none", cursor: "text"
          }
        }, sub.title),

    hovering ? ce("div", {
      onClick: p.onDelete,
      style: {
        cursor: "pointer", fontSize: 13, color: "var(--t3)",
        padding: "0 2px", lineHeight: 1, opacity: 0.6, flexShrink: 0
      }
    }, "×") : null
  );
}

// ── TASK CARD (compact, used inside owner lanes) ──────────────────────────────
function TaskCard(p) {
  var task = p.task;
  var s2 = useState(false); var editingTitle = s2[0]; var setEditingTitle = s2[1];
  var s3 = useState(task.title); var titleVal = s3[0]; var setTitleVal = s3[1];
  var s4 = useState(false); var addingSub = s4[0]; var setAddingSub = s4[1];
  var s5 = useState(""); var newSubVal = s5[0]; var setNewSubVal = s5[1];
  var s6 = useState(false); var expanded = s6[0]; var setExpanded = s6[1];
  var s7 = useState(false); var movingCat = s7[0]; var setMovingCat = s7[1];

  var subtasks = task.subtasks || [];
  var doneCount = subtasks.filter(function(s) { return s.done; }).length;
  var prio = PRIORITY[task.priority] || PRIORITY.medium;
  var progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;
  var owner = OWNERS[task.owner] || null;

  function commitTitle() {
    var v = titleVal.trim();
    if (v && v !== task.title) p.onUpdate({ title: v });
    else setTitleVal(task.title);
    setEditingTitle(false);
  }
  function addSubtask() {
    var v = newSubVal.trim();
    if (!v) { setAddingSub(false); return; }
    var newSub = { id: Date.now() + "_" + Math.random().toString(36).slice(2, 6), title: v, done: false };
    p.onUpdate({ subtasks: subtasks.concat([newSub]) });
    setNewSubVal(""); setAddingSub(false);
  }
  function updateSubtask(sid, patch) {
    p.onUpdate({ subtasks: subtasks.map(function(s) { return s.id === sid ? Object.assign({}, s, patch) : s; }) });
  }
  function deleteSubtask(sid) {
    p.onUpdate({ subtasks: subtasks.filter(function(s) { return s.id !== sid; }) });
  }

  return ce("div", {
    style: {
      background: "var(--bg)", border: "1px solid var(--bd2)",
      borderLeft: "3px solid " + prio.dot, borderRadius: 10,
      padding: "9px 10px", opacity: task.done ? 0.55 : 1
    }
  },
    // ── header row ──
    ce("div", { style: { display: "flex", alignItems: "flex-start", gap: 8 } },
      // checkbox
      ce("div", {
        onClick: function() { p.onUpdate({ done: !task.done }); },
        style: {
          width: 17, height: 17, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: "2px solid " + (task.done ? "var(--gr)" : "var(--bd2)"),
          background: task.done ? "var(--gr)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all .15s"
        }
      }, task.done ? ce("span", { style: { color: "var(--bg)", fontSize: 9, fontWeight: 700 } }, "✓") : null),

      // title
      ce("div", { style: { flex: 1, minWidth: 0 } },
        editingTitle
          ? ce(QuickInput, {
              value: titleVal, fontSize: 12.5, fontWeight: 600,
              onChange: setTitleVal, onConfirm: commitTitle,
              onCancel: function() { setTitleVal(task.title); setEditingTitle(false); }
            })
          : ce("div", {
              onDoubleClick: function() { if (!task.done) setEditingTitle(true); },
              style: {
                fontSize: 12.5, fontWeight: 600, color: "var(--t1)", lineHeight: 1.35,
                textDecoration: task.done ? "line-through" : "none",
                cursor: task.done ? "default" : "text", wordBreak: "break-word"
              }
            }, task.title)
      ),

      // owner avatar (click = toggle owner)
      ce("div", {
        onClick: function() {
          var next = task.owner === "damian" ? "paulina" : (task.owner === "paulina" ? null : "damian");
          p.onUpdate({ owner: next });
        },
        title: owner ? ("Osoba: " + owner.label + " (kliknij, by zmienić)") : "Przypisz osobę",
        style: {
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
          background: owner ? owner.color : "transparent",
          border: owner ? "none" : "1.5px dashed var(--bd2)",
          color: "#fff", fontSize: 10, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center"
        }
      }, owner ? owner.initials : ce("span", { style: { color: "var(--t3)", fontSize: 11 } }, "?"))
    ),

    // ── meta row ──
    ce("div", { style: { display: "flex", alignItems: "center", gap: 5, marginTop: 7, flexWrap: "wrap", paddingLeft: 25 } },
      task.priority === "high"
        ? ce("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", color: prio.color, background: prio.bg, borderRadius: 5, padding: "2px 6px" } }, "PILNE")
        : null,
      task.due_date
        ? ce("span", { style: { fontSize: 10, color: isOverdue(task) ? "#ef4444" : "var(--t3)", display: "flex", alignItems: "center", gap: 3 } }, "📅 " + formatDate(task.due_date))
        : null,
      subtasks.length > 0
        ? ce("span", { onClick: function() { setExpanded(!expanded); }, style: { fontSize: 10, color: "var(--t3)", cursor: "pointer" } }, (expanded ? "▾ " : "▸ ") + doneCount + "/" + subtasks.length)
        : ce("span", { onClick: function() { setExpanded(true); setAddingSub(true); }, style: { fontSize: 10, color: "var(--t3)", cursor: "pointer" } }, "+ podzadanie")
    ),

    // ── progress bar ──
    subtasks.length > 0
      ? ce("div", { style: { marginTop: 6, marginLeft: 25, height: 4, background: "var(--bd3)", borderRadius: 99, overflow: "hidden" } },
          ce("div", { style: { height: "100%", width: progress + "%", background: progress === 100 ? "var(--gr)" : "var(--t2)", borderRadius: 99, transition: "width .3s" } })
        )
      : null,

    // ── subtasks panel (collapsible) ──
    expanded
      ? ce("div", { style: { marginTop: 6, borderTop: "1px solid var(--bd3)", paddingTop: 4 } },
          subtasks.map(function(sub) {
            return ce(SubtaskRow, { key: sub.id, sub: sub,
              onUpdate: function(patch) { updateSubtask(sub.id, patch); },
              onDelete: function() { deleteSubtask(sub.id); } });
          }),
          addingSub
            ? ce("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" } },
                ce("div", { style: { width: 15, height: 15, borderRadius: 4, border: "1.5px solid var(--bd2)", flexShrink: 0 } }),
                ce(QuickInput, { value: newSubVal, fontSize: 12, placeholder: "Nowe podzadanie...",
                  onChange: setNewSubVal, onConfirm: addSubtask,
                  onCancel: function() { setAddingSub(false); setNewSubVal(""); } })
              )
            : ce("div", { onClick: function() { setAddingSub(true); },
                style: { display: "inline-flex", alignItems: "center", gap: 5, margin: "2px 0 0 8px", padding: "4px 8px",
                  border: "1.5px dashed var(--bd2)", borderRadius: 7, cursor: "pointer", fontSize: 10, color: "var(--t3)" } }, "+ podzadanie")
        )
      : null,

    // ── footer actions ──
    ce("div", { style: { display: "flex", alignItems: "center", gap: 4, marginTop: 7, paddingLeft: 25 } },
      // priority cycle
      ce("div", {
        onClick: function() {
          var keys = Object.keys(PRIORITY);
          var next = keys[(keys.indexOf(task.priority || "medium") + 1) % keys.length];
          p.onUpdate({ priority: next });
        },
        title: "Priorytet: " + prio.label,
        style: { cursor: "pointer", borderRadius: 6, padding: "2px 6px", fontSize: 8, fontWeight: 700,
          color: prio.color, background: prio.bg, border: "1px solid " + prio.color, letterSpacing: "0.04em" }
      }, prio.label.toUpperCase().slice(0, 3)),

      // date picker
      ce("div", { style: { position: "relative" } },
        ce("input", { type: "date", value: task.due_date || "",
          onChange: function(e) { p.onUpdate({ due_date: e.target.value || null }); },
          title: "Termin (trafia do Google Calendar)",
          style: { opacity: 0, position: "absolute", inset: 0, cursor: "pointer", zIndex: 1, width: "100%" } }),
        ce("div", { style: { borderRadius: 6, padding: "2px 6px", fontSize: 11,
          border: "1px solid var(--bd2)", background: "var(--bg2)", color: task.due_date ? "var(--t1)" : "var(--t3)" } }, "📅")
      ),

      // move category
      ce("div", { style: { position: "relative" } },
        ce("div", { onClick: function() { setMovingCat(!movingCat); }, title: "Przenieś do kategorii",
          style: { borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer",
            border: "1px solid var(--bd2)", background: "var(--bg2)", color: "var(--t3)" } }, "⇄"),
        movingCat
          ? ce("div", { style: { position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 5,
              background: "var(--bg)", border: "1px solid var(--bd2)", borderRadius: 9, padding: 4,
              boxShadow: "0 6px 20px rgba(0,0,0,0.12)", minWidth: 150 } },
              CAT_ORDER.map(function(cid) {
                var cm = CATEGORIES[cid];
                return ce("div", { key: cid, onClick: function() { p.onUpdate({ category: cid }); setMovingCat(false); },
                  style: { display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 7, cursor: "pointer",
                    fontSize: 12, color: task.category === cid ? cm.color : "var(--t2)", fontWeight: task.category === cid ? 700 : 400 } },
                  ce("span", null, cm.icon), cm.label);
              })
            )
          : null
      ),

      // delete
      ce("div", { onClick: p.onDelete, title: "Usuń zadanie",
        style: { marginLeft: "auto", cursor: "pointer", fontSize: 15, color: "var(--t3)", padding: "0 4px", opacity: 0.5, lineHeight: 1 } }, "×")
    )
  );
}

// ── OWNER LANE ───────────────────────────────────────────────────────────────
function OwnerLane(p) {
  var owner = p.ownerMeta;
  var tint = p.ownerId === "damian" ? "rgba(99,102,241,0.05)"
    : p.ownerId === "paulina" ? "rgba(219,39,119,0.05)" : "rgba(160,160,192,0.06)";
  return ce("div", { style: { background: tint, borderRadius: 12, padding: 8, minWidth: 0 } },
    // lane header
    ce("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "0 2px" } },
      ce("div", { style: { width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: owner ? owner.color : "var(--t3)", color: "#fff", fontSize: 10, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center" } }, owner ? owner.initials : "?"),
      ce("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--t1)", flex: 1 } }, owner ? owner.label : "Nieprzypisane"),
      ce("span", { style: { fontSize: 10, color: "var(--t3)" } }, p.items.length),
      p.ownerId !== "none"
        ? ce("div", { onClick: p.onAdd, title: "Dodaj zadanie", style: { cursor: "pointer", color: "var(--t3)", fontSize: 14, lineHeight: 1, padding: "0 2px" } }, "+")
        : null
    ),

    // inline add
    p.adding
      ? ce("div", { style: { display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", border: "1.5px solid " + (owner ? owner.color : "var(--bd2)"), borderRadius: 9, padding: "8px 9px", marginBottom: 7 } },
          ce("div", { style: { width: 17, height: 17, borderRadius: 5, border: "2px solid var(--bd2)", flexShrink: 0 } }),
          ce(QuickInput, { value: p.newTitle, fontSize: 12.5, fontWeight: 600, placeholder: "Nazwa zadania...",
            onChange: p.onNewTitle, onConfirm: p.onConfirmAdd, onCancel: p.onCancelAdd })
        )
      : null,

    // cards
    p.items.length === 0 && !p.adding
      ? ce("div", { style: { fontSize: 11, color: "var(--t3)", textAlign: "center", padding: "14px 0", opacity: 0.7 } }, "—")
      : ce("div", { style: { display: "flex", flexDirection: "column", gap: 7 } },
          p.items.map(function(t) {
            return ce(TaskCard, { key: t.id, task: t,
              onUpdate: function(patch) { p.onUpdate(t.id, patch); },
              onDelete: function() { p.onDelete(t.id); } });
          })
        )
  );
}

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────
export function ScreenTasks(p) {
  var gcalToken = p.gcalToken, setGcalToken = p.setGcalToken, gsiReady = p.gsiReady;

  var s1 = useState([]); var tasks = s1[0]; var setTasks = s1[1];
  var s2 = useState(true); var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(null); var error = s3[0]; var setError = s3[1];
  var s4 = useState("__overview__"); var activeCat = s4[0]; var setActiveCat = s4[1];
  var s5 = useState(null); var adding = s5[0]; var setAdding = s5[1]; // {cat, owner}
  var s6 = useState(""); var newTitle = s6[0]; var setNewTitle = s6[1];
  var s7 = useState(false); var showDone = s7[0]; var setShowDone = s7[1];

  // ── LOAD ──
  useEffect(function() {
    tasksApi.getTasks().then(function(data) {
      setTasks(data || []); setLoading(false);
    }).catch(function(e) {
      try {
        var local = JSON.parse(localStorage.getItem("porter_tasks") || "[]");
        setTasks(local);
      } catch(x) { setTasks([]); }
      setLoading(false);
      setError("Błąd Supabase: " + (e && e.message ? e.message : String(e)));
    });
  }, []);

  function saveTasks(newList) {
    localStorage.setItem("porter_tasks", JSON.stringify(newList));
  }

  // ── GOOGLE CALENDAR SYNC ────────────────────────────────────────────────────
  function gcalFetch(method, path, body) {
    function doIt(t) {
      return fetch("https://www.googleapis.com/calendar/v3" + path, {
        method: method,
        headers: { "Authorization": "Bearer " + t, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
    }
    return doIt(gcalToken).then(function(r) {
      if (r.status === 401) { return gcalGetToken().then(function(fresh) { setGcalToken(fresh); return doIt(fresh); }); }
      return r;
    }).then(function(r) {
      if (!r.ok && r.status !== 410) throw new Error("GCAL HTTP " + r.status);
      if (method === "DELETE") return null;
      return r.json();
    });
  }

  function gcalBody(task) {
    var start = task.due_date;
    var next = new Date(start + "T00:00:00"); next.setDate(next.getDate() + 1);
    var endStr = next.getFullYear() + "-" + pad2(next.getMonth() + 1) + "-" + pad2(next.getDate());
    var cm = task.category && CATEGORIES[task.category] ? CATEGORIES[task.category] : null;
    var ow = OWNERS[task.owner] || null;
    var desc = [];
    if (cm) desc.push("Kategoria: " + cm.label);
    if (ow) desc.push("Osoba: " + ow.label);
    desc.push("Porter Design — Zadania");
    return {
      summary: (task.done ? "\u2705 " : "\uD83D\uDCCB ") + task.title,
      description: desc.join(" | "),
      start: { date: start },
      end: { date: endStr }
    };
  }

  // returns Promise<patch> with gcal_event_id / gcal_cal_id to persist (or {})
  function syncGcal(task) {
    if (!gcalToken) return Promise.resolve({});
    // no date -> remove existing event if any
    if (!task.due_date) {
      if (task.gcal_event_id) {
        return gcalFetch("DELETE", "/calendars/primary/events/" + task.gcal_event_id)
          .then(function() { return { gcal_event_id: null, gcal_cal_id: null }; })
          .catch(function() { return {}; });
      }
      return Promise.resolve({});
    }
    var body = gcalBody(task);
    if (task.gcal_event_id) {
      return gcalFetch("PATCH", "/calendars/primary/events/" + task.gcal_event_id, body)
        .then(function() { return {}; })
        .catch(function() {
          // event gone -> recreate
          return gcalFetch("POST", "/calendars/primary/events", body)
            .then(function(ev) { return { gcal_event_id: ev.id, gcal_cal_id: "primary" }; })
            .catch(function() { return {}; });
        });
    }
    return gcalFetch("POST", "/calendars/primary/events", body)
      .then(function(ev) { return { gcal_event_id: ev.id, gcal_cal_id: "primary" }; })
      .catch(function() { return {}; });
  }

  // apply gcal id patch silently (no re-sync)
  function applyGcalIds(id, patch) {
    if (!patch || Object.keys(patch).length === 0) return;
    setTasks(function(ts) {
      var n = ts.map(function(t) { return t.id === id ? Object.assign({}, t, patch) : t; });
      saveTasks(n); return n;
    });
    tasksApi.updateTask(id, patch).catch(function() {});
  }

  // ── ADD ──
  function openAdd(cat, owner) {
    setAdding({ cat: cat, owner: owner });
    setNewTitle("");
  }
  function handleAdd() {
    var v = newTitle.trim();
    if (!v || !adding) { setAdding(null); return; }
    var newTask = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      title: v, done: false, priority: "medium",
      due_date: null, subtasks: [], sort_order: tasks.length,
      owner: adding.owner || null,
      category: (adding.cat === "__none__" || adding.cat === "__overview__") ? null : adding.cat,
      gcal_event_id: null, gcal_cal_id: null,
      created_at: new Date().toISOString()
    };
    tasksApi.addTask(newTask).then(function(res) {
      var added = (res && res[0]) ? res[0] : newTask;
      setTasks(function(ts) { var n = [added].concat(ts); saveTasks(n); return n; });
    }).catch(function() {
      setTasks(function(ts) { var n = [newTask].concat(ts); saveTasks(n); return n; });
    });
    setNewTitle(""); setAdding(null);
  }

  // ── UPDATE ──
  function handleUpdate(id, patch) {
    var updated = null;
    setTasks(function(ts) {
      var n = ts.map(function(t) {
        if (t.id !== id) return t;
        updated = Object.assign({}, t, patch);
        return updated;
      });
      saveTasks(n);
      return n;
    });
    // persist to Supabase (strip JS-only fields are not present; all columns exist)
    tasksApi.updateTask(id, patch).catch(function() {});
    // sync calendar when date / title / done / owner / category changed
    if (updated && (("due_date" in patch) || ("title" in patch) || ("done" in patch) || ("owner" in patch) || ("category" in patch))) {
      syncGcal(updated).then(function(idPatch) { applyGcalIds(id, idPatch); });
    }
  }

  // ── DELETE ──
  function handleDelete(id) {
    var victim = tasks.find(function(t) { return t.id === id; });
    setTasks(function(ts) { var n = ts.filter(function(t) { return t.id !== id; }); saveTasks(n); return n; });
    tasksApi.deleteTask(id).catch(function() {});
    if (victim && victim.gcal_event_id && gcalToken) {
      gcalFetch("DELETE", "/calendars/primary/events/" + victim.gcal_event_id).catch(function() {});
    }
  }

  // ── GOOGLE LOGIN ──
  function gLogin() {
    if (!gsiReady) { setError("Biblioteka Google jeszcze się ładuje, spróbuj za chwilę."); return; }
    gcalLogin().then(function(tok) { setGcalToken(tok); setError(null); })
      .catch(function(e) { setError("Błąd logowania Google: " + (e && e.message ? e.message : "nieznany")); });
  }

  // ── DERIVED ──
  var hasNone = tasks.some(function(t) { return catIdOf(t) === "__none__"; });
  var catCounts = {};
  CAT_ORDER.forEach(function(c) { catCounts[c] = 0; });
  catCounts["__none__"] = 0;
  tasks.forEach(function(t) { if (!t.done) catCounts[catIdOf(t)]++; });

  var totalDone = tasks.filter(function(t) { return t.done; }).length;

  if (loading) {
    return ce("div", { style: { textAlign: "center", padding: "4rem 0", color: "var(--t3)" } },
      ce("div", { style: { fontSize: 32, marginBottom: 12 } }, "📋"),
      ce("div", { style: { fontSize: 12, letterSpacing: "0.08em" } }, "Ładowanie zadań...")
    );
  }

  // category panel data
  var catTasks = tasks.filter(function(t) { return catIdOf(t) === activeCat; });
  var catActive = catTasks.filter(function(t) { return !t.done; });
  var catDone = catTasks.filter(function(t) { return t.done; });
  var catProg = catTasks.length > 0 ? Math.round((catDone.length / catTasks.length) * 100) : 0;
  var cm = catMeta(activeCat);

  var laneOwners = OWNER_ORDER.slice();
  var noneInCat = catActive.some(function(t) { return !t.owner; });
  if (noneInCat) laneOwners.push("none");

  function itemsFor(ownerId) {
    return catActive.filter(function(t) {
      return ownerId === "none" ? !t.owner : t.owner === ownerId;
    });
  }

  var SIDEBAR = ["__overview__"].concat(CAT_ORDER);
  if (hasNone) SIDEBAR.push("__none__");

  // overview metrics
  var damianActive  = tasks.filter(function(t) { return !t.done && t.owner === "damian"; }).length;
  var paulinaActive = tasks.filter(function(t) { return !t.done && t.owner === "paulina"; }).length;
  var urgentActive  = tasks.filter(function(t) { return !t.done && (t.priority === "high" || isOverdue(t)); }).length;

  function ownerDot(t) {
    var ow = OWNERS[t.owner];
    return ce("span", { style: { width: 17, height: 17, borderRadius: "50%", flexShrink: 0,
      background: ow ? ow.color : "transparent", border: ow ? "none" : "1.5px dashed var(--bd2)",
      color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" } },
      ow ? ow.initials : "");
  }

  function renderOverview() {
    var tiles = CAT_ORDER.slice();
    if (hasNone) tiles.push("__none__");
    return ce("div", null,
      // metric cards
      ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 } },
        ce("div", { style: { background: "var(--bg)", border: "1px solid var(--bd2)", borderRadius: 12, padding: "11px 13px" } },
          ce("div", { style: { fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 6 } },
            ce("span", { style: { width: 17, height: 17, borderRadius: "50%", background: OWNERS.damian.color, color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" } }, "D"), "Damian"),
          ce("div", { style: { fontSize: 22, fontWeight: 700, color: "var(--t1)", marginTop: 3 } }, damianActive, ce("span", { style: { fontSize: 11, color: "var(--t3)", fontWeight: 400 } }, " aktywnych"))
        ),
        ce("div", { style: { background: "var(--bg)", border: "1px solid var(--bd2)", borderRadius: 12, padding: "11px 13px" } },
          ce("div", { style: { fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 6 } },
            ce("span", { style: { width: 17, height: 17, borderRadius: "50%", background: OWNERS.paulina.color, color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" } }, "P"), "Paulina"),
          ce("div", { style: { fontSize: 22, fontWeight: 700, color: "var(--t1)", marginTop: 3 } }, paulinaActive, ce("span", { style: { fontSize: 11, color: "var(--t3)", fontWeight: 400 } }, " aktywnych"))
        ),
        ce("div", { style: { background: "var(--bg)", border: "1px solid var(--bd2)", borderRadius: 12, padding: "11px 13px" } },
          ce("div", { style: { fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 6 } }, "⏰ Pilne"),
          ce("div", { style: { fontSize: 22, fontWeight: 700, color: urgentActive > 0 ? "#ef4444" : "var(--t1)", marginTop: 3 } }, urgentActive)
        )
      ),
      // category tiles
      ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 } },
        tiles.map(function(cid) {
          var meta = catMeta(cid);
          var items = tasks.filter(function(t) { return !t.done && catIdOf(t) === cid; });
          return ce("div", { key: cid, style: { background: "var(--bg)", border: "1px solid var(--bd2)", borderRadius: 14, overflow: "hidden" } },
            ce("div", { onClick: function() { setActiveCat(cid); setAdding(null); },
              style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: meta.color + "0f", borderBottom: "1px solid var(--bd3)", cursor: "pointer" } },
              ce("span", { style: { color: meta.color, fontSize: 15 } }, meta.icon),
              ce("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--t1)", flex: 1 } }, meta.label),
              ce("span", { style: { fontSize: 10, fontWeight: 600, color: meta.color, background: meta.color + "1a", borderRadius: 7, padding: "2px 7px" } }, items.length)
            ),
            ce("div", { style: { padding: "8px 10px" } },
              items.length === 0
                ? ce("div", { style: { fontSize: 11, color: "var(--t3)", padding: "6px 0", opacity: 0.7 } }, "Brak aktywnych zadań")
                : ce("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
                    items.slice(0, 3).map(function(t) {
                      var pr = PRIORITY[t.priority] || PRIORITY.medium;
                      return ce("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: 8 } },
                        ce("span", { style: { width: 7, height: 7, borderRadius: "50%", background: pr.dot, flexShrink: 0 } }),
                        ce("span", { style: { fontSize: 12, color: "var(--t1)", flex: 1, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, t.title),
                        t.due_date ? ce("span", { style: { fontSize: 9.5, color: isOverdue(t) ? "#ef4444" : "var(--t3)", flexShrink: 0 } }, formatDate(t.due_date)) : null,
                        ownerDot(t)
                      );
                    })
                  ),
              items.length > 3
                ? ce("div", { onClick: function() { setActiveCat(cid); setAdding(null); },
                    style: { marginTop: 7, fontSize: 10.5, color: meta.color, cursor: "pointer", fontWeight: 600 } }, "+" + (items.length - 3) + " więcej →")
                : null
            )
          );
        })
      )
    );
  }

  return ce("div", { style: { paddingBottom: 40 } },

    // ── HEADER ──
    ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 } },
      ce("div", null,
        ce("div", { style: { fontSize: 20, fontWeight: 700, color: "var(--t1)" } }, "📋 Zadania"),
        ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } }, (tasks.length - totalDone) + " aktywnych · " + totalDone + " ukończonych")
      ),
      ce("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        // google sync state
        gcalToken
          ? ce("span", { style: { fontSize: 11, color: "var(--gr)", display: "flex", alignItems: "center", gap: 5, background: "var(--grl)", borderRadius: 9, padding: "6px 10px" } }, "✓ Synchronizacja z Google Calendar")
          : ce("button", { onClick: gLogin, style: { padding: "8px 12px", borderRadius: 10, border: "1px solid #4285f4", background: "none", color: "#4285f4", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } }, "🔑 Połącz z Google Calendar"),
        ce("button", { onClick: function() {
            var targetCat = activeCat === "__overview__" ? CAT_ORDER[0] : activeCat;
            if (activeCat === "__overview__") { setActiveCat(targetCat); }
            openAdd(targetCat, "damian");
          },
          style: { padding: "9px 16px", borderRadius: 11, border: "none", background: "var(--t1)", color: "var(--bg)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" } },
          ce("span", null, "+"), "Nowe zadanie")
      )
    ),

    // error banner
    error
      ? ce("div", { style: { background: "var(--amber-l)", border: "1px solid var(--amber)", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "var(--amber)" } }, "⚠ " + error)
      : null,

    // ── HUB GRID ──
    ce("div", { style: { display: "grid", gridTemplateColumns: "180px 1fr", gap: 14, alignItems: "start" } },

      // ── SIDEBAR ──
      ce("div", { style: { display: "flex", flexDirection: "column", gap: 5 } },
        SIDEBAR.map(function(cid) {
          var isOv = cid === "__overview__";
          var meta = isOv ? { label: "Przegląd", icon: "🏠", color: "#7c3aed" } : catMeta(cid);
          var act = activeCat === cid;
          var count = isOv ? (tasks.length - totalDone) : (catCounts[cid] || 0);
          return ce("div", { key: cid, onClick: function() { setActiveCat(cid); setAdding(null); },
            style: { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 11, cursor: "pointer",
              background: act ? meta.color + "1a" : "var(--bg2)",
              border: act ? "1.5px solid " + meta.color : "1px solid var(--bd2)",
              marginBottom: isOv ? 6 : 0,
              transition: "all .12s" } },
            ce("span", { style: { fontSize: 15, lineHeight: 1 } }, meta.icon),
            ce("span", { style: { fontSize: 12.5, fontWeight: act ? 700 : 500, color: act ? "var(--t1)" : "var(--t2)", flex: 1 } }, meta.label),
            ce("span", { style: { fontSize: 10, fontWeight: 600, color: act ? meta.color : "var(--t3)" } }, count || "")
          );
        })
      ),

      // ── RIGHT PANEL: overview or category ──
      activeCat === "__overview__"
        ? renderOverview()
        : ce("div", { style: { background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: 14, padding: 12 } },

        // panel header
        ce("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } },
          ce("span", { style: { width: 28, height: 28, borderRadius: 9, background: cm.color + "1f", color: cm.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 } }, cm.icon),
          ce("span", { style: { fontSize: 15, fontWeight: 700, color: "var(--t1)", flex: 1 } }, cm.label),
          ce("span", { style: { fontSize: 11, color: "var(--t3)" } }, catDone.length + "/" + catTasks.length + " gotowe")
        ),
        // progress
        ce("div", { style: { height: 5, background: "var(--bd3)", borderRadius: 99, overflow: "hidden", marginBottom: 12 } },
          ce("div", { style: { height: "100%", width: catProg + "%", background: cm.color, borderRadius: 99, transition: "width .4s" } })
        ),

        // lanes
        ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 } },
          laneOwners.map(function(oid) {
            return ce(OwnerLane, {
              key: oid,
              ownerId: oid,
              ownerMeta: OWNERS[oid] || null,
              items: itemsFor(oid),
              adding: !!(adding && adding.cat === activeCat && (adding.owner || null) === (oid === "none" ? null : oid)),
              newTitle: newTitle,
              onNewTitle: setNewTitle,
              onConfirmAdd: handleAdd,
              onCancelAdd: function() { setAdding(null); setNewTitle(""); },
              onAdd: function() { openAdd(activeCat, oid); },
              onUpdate: handleUpdate,
              onDelete: handleDelete
            });
          })
        ),

        // empty category
        catActive.length === 0 && !adding
          ? ce("div", { style: { textAlign: "center", padding: "1.5rem 0", color: "var(--t3)", fontSize: 12 } },
              ce("div", { style: { fontSize: 30, marginBottom: 8, opacity: 0.4 } }, "📭"),
              "Brak aktywnych zadań w tej kategorii")
          : null,

        // completed section (collapsible)
        catDone.length > 0
          ? ce("div", { style: { marginTop: 12, borderTop: "1px solid var(--bd3)", paddingTop: 10 } },
              ce("div", { onClick: function() { setShowDone(!showDone); },
                style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)", cursor: "pointer", marginBottom: showDone ? 8 : 0 } },
                ce("span", null, showDone ? "▾" : "▸"), "Ukończone (" + catDone.length + ")"),
              showDone
                ? ce("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 7 } },
                    catDone.map(function(t) {
                      return ce(TaskCard, { key: t.id, task: t,
                        onUpdate: function(patch) { handleUpdate(t.id, patch); },
                        onDelete: function() { handleDelete(t.id); } });
                    })
                  )
                : null
            )
          : null
      )
    )
  );
}
