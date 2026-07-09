// src/lib/themes.js — 4 motywy dla Asystent Dekoracji

export var THEMES = {
  classic: {
    id: "classic",
    name: "Klasyczny",
    preview: ["#7c3aed","#0d9488","#ece9f8"],
    vars: {
      "--bg":           "#ece9f8",
      "--bg2":          "rgba(255,255,255,0.62)",
      "--bg3":          "rgba(255,255,255,0.38)",
      "--bd1":          "rgba(139,92,246,0.28)",
      "--bd2":          "rgba(139,92,246,0.18)",
      "--bd3":          "rgba(139,92,246,0.09)",
      "--t1":           "#1e1b4b",
      "--t2":           "#6b6b9a",
      "--t3":           "#a0a0c0",
      "--glass-bg":     "rgba(255,255,255,0.55)",
      "--glass-border": "rgba(255,255,255,0.80)",
      "--glass-shadow": "0 8px 32px rgba(99,102,241,0.13), 0 1.5px 0 rgba(255,255,255,0.80) inset",
      "--violet":       "#7c3aed",
      "--violet-l":     "rgba(124,58,237,0.12)",
    },
    bodyBg: [
      "radial-gradient(ellipse at 15% 20%, rgba(167,139,250,0.45) 0%, transparent 50%)",
      "radial-gradient(ellipse at 85% 10%, rgba(94,234,212,0.30) 0%, transparent 45%)",
      "radial-gradient(ellipse at 70% 80%, rgba(196,181,253,0.35) 0%, transparent 50%)",
      "radial-gradient(ellipse at 10% 85%, rgba(110,231,183,0.25) 0%, transparent 45%)",
      "linear-gradient(160deg, #e0d9f7 0%, #d4eaf5 50%, #ddf4ed 100%)"
    ].join(","),
  },

  light: {
    id: "light",
    name: "Jasny",
    preview: ["#2563eb","#374151","#f9fafb"],
    vars: {
      "--bg":           "#f9fafb",
      "--bg2":          "rgba(255,255,255,0.95)",
      "--bg3":          "rgba(249,250,251,0.80)",
      "--bd1":          "rgba(55,65,81,0.20)",
      "--bd2":          "rgba(55,65,81,0.13)",
      "--bd3":          "rgba(55,65,81,0.07)",
      "--t1":           "#111827",
      "--t2":           "#374151",
      "--t3":           "#9ca3af",
      "--glass-bg":     "rgba(255,255,255,0.95)",
      "--glass-border": "rgba(229,231,235,1)",
      "--glass-shadow": "0 4px 24px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,1) inset",
      "--violet":       "#2563eb",
      "--violet-l":     "rgba(37,99,235,0.08)",
    },
    bodyBg: "#f9fafb",
  },

  dark: {
    id: "dark",
    name: "Ciemny",
    preview: ["#6366f1","#10b981","#111827"],
    vars: {
      "--bg":           "#111827",
      "--bg2":          "rgba(31,41,55,0.98)",
      "--bg3":          "rgba(55,65,81,0.60)",
      "--bd1":          "rgba(99,102,241,0.35)",
      "--bd2":          "rgba(99,102,241,0.20)",
      "--bd3":          "rgba(99,102,241,0.10)",
      "--t1":           "#f9fafb",
      "--t2":           "#d1d5db",
      "--t3":           "#6b7280",
      "--glass-bg":     "rgba(31,41,55,0.95)",
      "--glass-border": "rgba(55,65,81,0.80)",
      "--glass-shadow": "0 8px 32px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.05) inset",
      "--violet":       "#6366f1",
      "--violet-l":     "rgba(99,102,241,0.18)",
    },
    bodyBg: "#111827",
  },

  atelier: {
    id: "atelier",
    name: "Atelier",
    preview: ["#78716c","#a8a29e","#faf9f7"],
    vars: {
      "--bg":           "#faf9f7",
      "--bg2":          "rgba(255,255,255,0.95)",
      "--bg3":          "rgba(250,249,247,0.80)",
      "--bd1":          "rgba(120,113,108,0.22)",
      "--bd2":          "rgba(120,113,108,0.14)",
      "--bd3":          "rgba(120,113,108,0.07)",
      "--t1":           "#1c1917",
      "--t2":           "#57534e",
      "--t3":           "#a8a29e",
      "--glass-bg":     "rgba(255,255,255,0.92)",
      "--glass-border": "rgba(231,229,228,1)",
      "--glass-shadow": "0 4px 24px rgba(120,113,108,0.10), 0 1px 0 rgba(255,255,255,1) inset",
      "--violet":       "#78716c",
      "--violet-l":     "rgba(120,113,108,0.10)",
    },
    bodyBg: [
      "radial-gradient(ellipse at 20% 20%, rgba(214,211,209,0.50) 0%, transparent 55%)",
      "radial-gradient(ellipse at 80% 80%, rgba(168,162,158,0.30) 0%, transparent 50%)",
      "linear-gradient(160deg, #f5f3f0 0%, #faf9f7 60%, #f5f4f2 100%)"
    ].join(","),
  },
};

var THEME_KEY = "ad_theme";

export function applyTheme(id) {
  var theme = THEMES[id] || THEMES.classic;
  var root = document.documentElement;
  Object.keys(theme.vars).forEach(function(key) {
    root.style.setProperty(key, theme.vars[key]);
  });
  document.body.style.background = theme.bodyBg;
  document.body.style.backgroundAttachment = "fixed";
  localStorage.setItem(THEME_KEY, id);
}

export function loadSavedTheme() {
  var saved = localStorage.getItem(THEME_KEY);
  if (saved && THEMES[saved]) applyTheme(saved);
}

export function getCurrentThemeId() {
  return localStorage.getItem(THEME_KEY) || "classic";
}
