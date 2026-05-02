import React, { useState, useEffect, useRef } from 'react';
import { sbApi, SB_URL, SB_KEY } from '../lib/supabase.js';

var ce = React.createElement;

// ── SUPABASE HELPER ─────────────────────────────────────────────────────────
function sbFetch(method, path, body) {
  return fetch(SB_URL + "/rest/v1/" + path, {
    method: method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error(t); });
    var ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) return r.json();
    return null;
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
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 12px 7px 36px",
      background: hovering ? "var(--bg2)" : "transparent",
      borderRadius: 8, transition: "background .12s", cursor: "default",
      opacity: sub.done ? 0.5 : 1
    }
  },
    // checkbox
    ce("div", {
      onClick: function() { p.onUpdate({ done: !sub.done }); },
      style: {
        width: 16, height: 16, borderRadius: 4,
        border: "1.5px solid " + (sub.done ? "var(--gr)" : "var(--bd2)"),
        background: sub.done ? "var(--gr)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0, transition: "all .15s"
      }
    }, sub.done ? ce("span", { style: { color: "#fff", fontSize: 9, fontWeight: 700 } }, "✓") : null),

    // title
    editing
      ? ce(QuickInput, {
          value: editVal, fontSize: 13,
          onChange: setEditVal, onConfirm: commitEdit,
          onCancel: function() { setEditVal(sub.title); setEditing(false); }
        })
      : ce("span", {
          onDoubleClick: function() { setEditing(true); },
          style: {
            flex: 1, fontSize: 13, color: "var(--t1)", lineHeight: 1.4,
            textDecoration: sub.done ? "line-through" : "none",
            cursor: "text"
          }
        }, sub.title),

    // delete
    hovering ? ce("button", {
      onClick: p.onDelete,
      style: {
        border: "none", background: "none", cursor: "pointer",
        fontSize: 13, color: "var(--t3)", padding: "0 2px", lineHeight: 1,
        opacity: 0.6, flexShrink: 0
      }
    }, "×") : null
  );
}

// ── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard(p) {
  var task = p.task;
  var s2 = useState(false); var editingTitle = s2[0]; var setEditingTitle = s2[1];
  var s3 = useState(task.title); var titleVal = s3[0]; var setTitleVal = s3[1];
  var s4 = useState(false); var addingSub = s4[0]; var setAddingSub = s4[1];
  var s5 = useState(""); var newSubVal = s5[0]; var setNewSubVal = s5[1];
  var s6 = useState(false); var hovering = s6[0]; var setHovering = s6[1];

  var subtasks = task.subtasks || [];
  var doneCount = subtasks.filter(function(s) { return s.done; }).length;
  var prio = PRIORITY[task.priority] || PRIORITY.medium;
  var progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;

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
    setNewSubVal("");
    setAddingSub(false);
  }

  function updateSubtask(sid, patch) {
    p.onUpdate({ subtasks: subtasks.map(function(s) { return s.id === sid ? Object.assign({}, s, patch) : s; }) });
  }

  function deleteSubtask(sid) {
    p.onUpdate({ subtasks: subtasks.filter(function(s) { return s.id !== sid; }) });
  }

  return ce("div", {
    onMouseEnter: function() { setHovering(true); },
    onMouseLeave: function() { setHovering(false); },
    style: {
      background: "var(--bg)", border: "1px solid var(--bd2)",
      borderLeft: "3px solid " + prio.dot,
      borderRadius: 14, overflow: "hidden",
      boxShadow: hovering ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 4px rgba(0,0,0,0.04)",
      transition: "box-shadow .15s",
      opacity: task.done ? 0.6 : 1
    }
  },

    // ── CARD HEADER ──
    ce("div", { style: { padding: "14px 16px" } },
      ce("div", { style: { display: "flex", alignItems: "flex-start", gap: 12 } },

        // big checkbox
        ce("div", {
          onClick: function() { p.onUpdate({ done: !task.done }); },
          style: {
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: "2px solid " + (task.done ? "var(--gr)" : "var(--bd2)"),
            background: task.done ? "var(--gr)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all .15s"
          }
        }, task.done ? ce("span", { style: { color: "#fff", fontSize: 11, fontWeight: 700 } }, "✓") : null),

        // title + meta
        ce("div", { style: { flex: 1, minWidth: 0 } },
          editingTitle
            ? ce(QuickInput, {
                value: titleVal, fontSize: 15, fontWeight: 600,
                onChange: setTitleVal, onConfirm: commitTitle,
                onCancel: function() { setTitleVal(task.title); setEditingTitle(false); }
              })
            : ce("div", {
                onDoubleClick: function() { if (!task.done) setEditingTitle(true); },
                style: {
                  fontSize: 15, fontWeight: 600, color: "var(--t1)", lineHeight: 1.3,
                  textDecoration: task.done ? "line-through" : "none",
                  cursor: task.done ? "default" : "text", wordBreak: "break-word"
                }
              }, task.title),

          // meta row
          ce("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" } },
            // priority badge
            ce("span", {
              style: {
                fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                color: prio.color, background: prio.bg,
                borderRadius: 5, padding: "2px 7px"
              }
            }, prio.label.toUpperCase()),

            // due date
            task.due_date
              ? ce("span", { style: { fontSize: 11, color: isOverdue(task) ? "#ef4444" : "var(--t3)", display: "flex", alignItems: "center", gap: 3 } },
                  ce("span", null, "📅"),
                  formatDate(task.due_date)
                )
              : null,

            // subtasks counter
            subtasks.length > 0
              ? ce("span", { style: { fontSize: 11, color: "var(--t3)" } },
                  doneCount + "/" + subtasks.length + " podzadań"
                )
              : null
          ),

          // progress bar
          subtasks.length > 0
            ? ce("div", { style: { marginTop: 8, height: 4, background: "var(--bd3)", borderRadius: 99, overflow: "hidden" } },
                ce("div", {
                  style: {
                    height: "100%", width: progress + "%",
                    background: progress === 100 ? "var(--gr)" : "var(--t2)",
                    borderRadius: 99, transition: "width .3s"
                  }
                })
              )
            : null
        ),

        // actions
        ce("div", { style: { display: "flex", gap: 4, flexShrink: 0 } },
          // priority toggle
          ce("button", {
            onClick: function(e) {
              e.stopPropagation();
              var keys = Object.keys(PRIORITY);
              var next = keys[(keys.indexOf(task.priority || "medium") + 1) % keys.length];
              p.onUpdate({ priority: next });
            },
            title: "Zmień priorytet",
            style: {
              border: "1.5px solid " + prio.color, background: prio.bg,
              cursor: "pointer", borderRadius: 7, padding: "4px 7px",
              fontSize: 9, fontWeight: 700, color: prio.color,
              letterSpacing: "0.05em"
            }
          }, prio.label.toUpperCase().slice(0, 3)),

          // date picker
          ce("div", { style: { position: "relative" } },
            ce("input", {
              type: "date",
              value: task.due_date || "",
              onChange: function(e) { p.onUpdate({ due_date: e.target.value || null }); },
              title: "Termin",
              style: {
                opacity: 0, position: "absolute", inset: 0, cursor: "pointer", zIndex: 1
              }
            }),
            ce("button", {
              style: {
                border: "1.5px solid var(--bd2)", background: "var(--bg2)",
                cursor: "pointer", borderRadius: 7, padding: "4px 7px",
                fontSize: 13, color: task.due_date ? "var(--t1)" : "var(--t3)"
              }
            }, "📅")
          ),

          // delete
          ce("button", {
            onClick: p.onDelete,
            title: "Usuń zadanie",
            style: {
              border: "none", background: "none", cursor: "pointer",
              fontSize: 16, color: "var(--t3)", padding: "4px 6px",
              opacity: 0.5, lineHeight: 1
            }
          }, "×")
        )
      )
    ),

    // ── SUBTASKS PANEL ──
    ce("div", { style: { borderTop: subtasks.length > 0 || addingSub ? "1px solid var(--bd3)" : "none", paddingTop: subtasks.length > 0 || addingSub ? 6 : 0, paddingBottom: subtasks.length > 0 || addingSub ? 6 : 0 } },
        subtasks.map(function(sub) {
          return ce(SubtaskRow, {
            key: sub.id, sub: sub,
            onUpdate: function(patch) { updateSubtask(sub.id, patch); },
            onDelete: function() { deleteSubtask(sub.id); }
          });
        }),
        addingSub
          ? ce("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 36px" } },
              ce("div", { style: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--bd2)", flexShrink: 0 } }),
              ce(QuickInput, {
                value: newSubVal, fontSize: 13, placeholder: "Nowe podzadanie...",
                onChange: setNewSubVal, onConfirm: addSubtask,
                onCancel: function() { setAddingSub(false); setNewSubVal(""); }
              })
            )
          : null,
        ce("button", {
          onClick: function() { setAddingSub(true); },
          style: {
            display: "flex", alignItems: "center", gap: 6,
            margin: "4px 12px 4px 36px", padding: "5px 10px",
            border: "1.5px dashed var(--bd2)", borderRadius: 8,
            background: "transparent", cursor: "pointer",
            fontSize: 11, color: "var(--t3)", fontFamily: "inherit"
          }
        }, "+ Dodaj podzadanie")
      )
  );
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

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────
export function ScreenTasks() {
  var s1 = useState([]); var tasks = s1[0]; var setTasks = s1[1];
  var s2 = useState(true); var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(null); var error = s3[0]; var setError = s3[1];
  var s4 = useState(""); var newTitle = s4[0]; var setNewTitle = s4[1];
  var s5 = useState(false); var adding = s5[0]; var setAdding = s5[1];
  var s6 = useState("all"); var filter = s6[0]; var setFilter = s6[1];
  var newRef = useRef(null);

  // ── LOAD ──
  useEffect(function() {
    tasksApi.getTasks().then(function(data) {
      setTasks(data || []);
      setLoading(false);
    }).catch(function(e) {
      // fallback: localStorage if Supabase table doesn't exist yet
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

  // ── ADD ──
  function handleAdd() {
    var v = newTitle.trim();
    if (!v) { setAdding(false); return; }
    var newTask = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      title: v, done: false, priority: "medium",
      due_date: null, subtasks: [], sort_order: tasks.length,
      created_at: new Date().toISOString()
    };
    tasksApi.addTask(newTask).then(function(res) {
      var added = (res && res[0]) ? res[0] : newTask;
      setTasks(function(ts) { var n = [added].concat(ts); saveTasks(n); return n; });
    }).catch(function() {
      setTasks(function(ts) { var n = [newTask].concat(ts); saveTasks(n); return n; });
    });
    setNewTitle(""); setAdding(false);
  }

  // ── UPDATE ──
  function handleUpdate(id, patch) {
    setTasks(function(ts) {
      var n = ts.map(function(t) { return t.id === id ? Object.assign({}, t, patch) : t; });
      saveTasks(n);
      tasksApi.updateTask(id, patch).catch(function() {});
      return n;
    });
  }

  // ── DELETE ──
  function handleDelete(id) {
    setTasks(function(ts) {
      var n = ts.filter(function(t) { return t.id !== id; });
      saveTasks(n);
      tasksApi.deleteTask(id).catch(function() {});
      return n;
    });
  }

  // ── FILTER ──
  var FILTERS = [
    { id: "all",    label: "Wszystkie" },
    { id: "active", label: "Aktywne" },
    { id: "done",   label: "Gotowe" },
    { id: "urgent", label: "Pilne" }
  ];

  var visible = tasks.filter(function(t) {
    if (filter === "active") return !t.done;
    if (filter === "done")   return !!t.done;
    if (filter === "urgent") return !t.done && (t.priority === "high" || isOverdue(t));
    return true;
  });

  var totalDone = tasks.filter(function(t) { return t.done; }).length;
  var totalProgress = tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0;

  if (loading) {
    return ce("div", { style: { textAlign: "center", padding: "4rem 0", color: "var(--t3)" } },
      ce("div", { style: { fontSize: 32, marginBottom: 12 } }, "📋"),
      ce("div", { style: { fontSize: 12, letterSpacing: "0.08em" } }, "Ładowanie zadań...")
    );
  }

  return ce("div", { style: { paddingBottom: 40 } },

    // ── HEADER ──
    ce("div", { style: { marginBottom: 20 } },
      ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 } },
        ce("div", null,
          ce("div", { style: { fontSize: 20, fontWeight: 700, color: "var(--t1)" } }, "📋 Zadania"),
          ce("div", { style: { fontSize: 12, color: "var(--t3)", marginTop: 2 } },
            totalDone + " / " + tasks.length + " ukończonych"
          )
        ),
        ce("button", {
          onClick: function() { setAdding(true); setTimeout(function() { if (newRef.current) newRef.current.focus(); }, 50); },
          style: {
            padding: "10px 18px", borderRadius: 11, border: "none",
            background: "var(--t1)", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6
          }
        }, ce("span", null, "+"), "Nowe zadanie")
      ),

      // global progress bar
      tasks.length > 0
        ? ce("div", { style: { height: 6, background: "var(--bd3)", borderRadius: 99, overflow: "hidden", marginTop: 10 } },
            ce("div", {
              style: {
                height: "100%", width: totalProgress + "%",
                background: "linear-gradient(90deg, #6366f1, var(--gr))",
                borderRadius: 99, transition: "width .4s"
              }
            })
          )
        : null
    ),

    // ── ADD FORM ──
    adding
      ? ce("div", {
          style: {
            background: "var(--bg)", border: "2px solid var(--t1)",
            borderRadius: 14, padding: "14px 16px",
            marginBottom: 16, display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
          }
        },
          ce("div", { style: { width: 22, height: 22, borderRadius: 6, border: "2px solid var(--bd2)", flexShrink: 0 } }),
          ce("input", {
            ref: newRef,
            type: "text",
            value: newTitle,
            onChange: function(e) { setNewTitle(e.target.value); },
            onKeyDown: function(e) {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
            },
            placeholder: "Nazwa zadania... (Enter = dodaj, Esc = anuluj)",
            style: {
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 15, fontWeight: 600, color: "var(--t1)", fontFamily: "inherit"
            }
          }),
          ce("button", {
            onClick: handleAdd,
            style: {
              padding: "7px 14px", borderRadius: 9, border: "none",
              background: "var(--t1)", color: "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer"
            }
          }, "Dodaj")
        )
      : null,

    // ── FILTERS ──
    ce("div", {
      style: {
        display: "flex", gap: 4, marginBottom: 16,
        background: "var(--bg2)", borderRadius: 11, padding: 3,
        border: "1px solid var(--bd2)"
      }
    },
      FILTERS.map(function(f) {
        var active = filter === f.id;
        var count = f.id === "all" ? tasks.length
          : f.id === "active" ? tasks.filter(function(t) { return !t.done; }).length
          : f.id === "done"   ? tasks.filter(function(t) { return t.done; }).length
          : tasks.filter(function(t) { return !t.done && (t.priority === "high" || isOverdue(t)); }).length;

        return ce("button", {
          key: f.id,
          onClick: function() { setFilter(f.id); },
          style: {
            flex: 1, padding: "7px 4px", borderRadius: 8, border: "none",
            background: active ? "var(--bg)" : "transparent",
            color: active ? "var(--t1)" : "var(--t3)",
            fontWeight: active ? 700 : 400,
            fontSize: 11, cursor: "pointer",
            boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all .15s",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            fontFamily: "inherit"
          }
        },
          ce("span", null, f.label),
          ce("span", { style: { fontSize: 9, opacity: 0.7 } }, count)
        );
      })
    ),

    // error banner
    error
      ? ce("div", { style: { background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#b45309" } },
          "⚠ " + error + " Dane zapisywane lokalnie."
        )
      : null,

    // ── TASK LIST ──
    visible.length === 0
      ? ce("div", {
          style: {
            textAlign: "center", padding: "3rem 0",
            color: "var(--t3)", fontSize: 13
          }
        },
          ce("div", { style: { fontSize: 40, marginBottom: 12, opacity: 0.4 } }, filter === "done" ? "🎉" : "📭"),
          filter === "done"
            ? "Brak ukończonych zadań"
            : filter === "urgent"
            ? "Brak pilnych zadań – wszystko pod kontrolą!"
            : tasks.length === 0
            ? ce("div", null,
                ce("div", { style: { fontWeight: 600, marginBottom: 6 } }, "Brak zadań"),
                ce("div", { style: { fontSize: 11 } }, "Kliknij '+ Nowe zadanie' aby zacząć")
              )
            : "Brak aktywnych zadań"
        )
      : ce("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          visible.map(function(task) {
            return ce(TaskCard, {
              key: task.id,
              task: task,
              onUpdate: function(patch) { handleUpdate(task.id, patch); },
              onDelete: function() { handleDelete(task.id); }
            });
          })
        )
  );
}
