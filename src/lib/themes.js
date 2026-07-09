// src/lib/themes.js
// Cztery motywy kolorystyczne dla Asystent Dekoracji
// applyTheme(id) ustawia CSS vars na :root i zapisuje w localStorage

export var THEMES = {
  classic: {
    id: "classic",
    name: "Klasyczny",
    preview: ["#7c3aed","#0d9488","#ece9f8"],
    vars: {
      "--bg":            "#ece9f8",
      "--bg2":           "rgba(255,255,255,0.62)",
      "--bg3":           "rgba(255,255,255,0.38)",
      "--bd1":           "rgba(139,92,246,0.28)",
      "--bd2":           "rgba(139,92,246,0.18)",
      "--bd3":           "rgba(139,92,246,0.09)",
      "--t1":            "#1e1b4b",
      "--t2":            "#6b6b9a",
      "--t3":            "#a0a0c0",
      "--glass-bg":      "rgba(255,255,255,0.55)",
      "--glass-border":  "rgba(255,255,255,0.80)",
      "--glass-shadow":  "0 8px 32px rgba(99,102,241,0.13), 0 1.5px 0 rgba(255,255,255,0.80) inset",
      "--violet":        "#7c3aed",
      "--violet-l":      "rgba(124,58,237,0.12)",
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
    preview: ["#2563eb","#059669","#f1f5f9"],
    vars: {
      "--bg":            "#f1f5f9",
      "--bg2":           "rgba(255,255,255,0.85)",
      "--bg3":           "rgba(255,255,255,0.60)",
      "--bd1":           "rgba(37,99,235,0.22)",
      "--bd2":           "rgba(37,99,235,0.13)",
      "--bd3":           "rgba(37,99,235,0.06)",
      "--t1":            "#0f172a",
      "--t2":            "#475569",
      "--t3":            "#94a3b8",
      "--glass-bg":      "rgba(255,255,255,0.80)",
      "--glass-border":  "rgba(255,255,255,0.95)",
      "--glass-shadow":  "0 8px 32px rgba(37,99,235,0.08), 0 1.5px 0 rgba(255,255,255,0.90) inset",
      "--violet":        "#2563eb",
      "--violet-l":      "rgba(37,99,235,0.10)",
    },
    bodyBg: [
      "radial-gradient(ellipse at 20% 20%, rgba(147,197,253,0.35) 0%, transparent 50%)",
      "radial-gradient(ellipse at 80% 15%, rgba(110,231,183,0.25) 0%, transparent 45%)",
      "radial-gradient(ellipse at 60% 85%, rgba(196,181,253,0.20) 0%, transparent 50%)",
      "linear-gradient(160deg, #f0f7ff 0%, #f1faf5 50%, #f5f0ff 100%)"
    ].join(","),
  },

  dark: {
    id: "dark",
    name: "Ciemny",
    preview: ["#a78bfa","#34d399","#1e1b2e"],
    vars: {
      "--bg":            "#1e1b2e",
      "--bg2":           "rgba(40,36,60,0.85)",
      "--bg3":           "rgba(50,45,75,0.60)",
      "--bd1":           "rgba(167,139,250,0.30)",
      "--bd2":           "rgba(167,139,250,0.18)",
      "--bd3":           "rgba(167,139,250,0.09)",
      "--t1":            "#ede9fe",
      "--t2":            "#a5b4fc",
      "--t3":            "#6d6d8f",
      "--glass-bg":      "rgba(30,27,46,0.75)",
      "--glass-border":  "rgba(167,139,250,0.20)",
      "--glass-shadow":  "0 8px 32px rgba(0,0,0,0.35), 0 1.5px 0 rgba(167,139,250,0.12) inset",
      "--violet":        "#a78bfa",
      "--violet-l":      "rgba(167,139,250,0.15)",
    },
    bodyBg: [
      "radial-gradient(ellipse at 15% 20%, rgba(124,58,237,0.25) 0%, transparent 50%)",
      "radial-gradient(ellipse at 85% 10%, rgba(13,148,136,0.15) 0%, transparent 45%)",
      "radial-gradient(ellipse at 70% 85%, rgba(167,139,250,0.18) 0%, transparent 50%)",
      "linear-gradient(160deg, #1a1728 0%, #1b2535 50%, #1a2820 100%)"
    ].join(","),
  },

  atelier: {
    id: "atelier",
    name: "Atelier",
    preview: ["#92704a","#5d8a6e","#f5f0e8"],
    vars: {
      "--bg":            "#f5f0e8",
      "--bg2":           "rgba(255,252,245,0.80)",
      "--bg3":           "rgba(255,252,245,0.50)",
      "--bd1":           "rgba(146,112,74,0.28)",
      "--bd2":           "rgba(146,112,74,0.18)",
      "--bd3":           "rgba(146,112,74,0.09)",
      "--t1":            "#2c1f0e",
      "--t2":            "#6b5740",
      "--t3":            "#a89480",
      "--glass-bg":      "rgba(255,250,240,0.72)",
      "--glass-border":  "rgba(255,252,245,0.90)",
      "--glass-shadow":  "0 8px 32px rgba(146,112,74,0.12), 0 1.5px 0 rgba(255,252,245,0.90) inset",
      "--violet":        "#92704a",
      "--violet-l":      "rgba(146,112,74,0.12)",
    },
    bodyBg: [
      "radial-gradient(ellipse at 20% 20%, rgba(212,185,150,0.35) 0%, transparent 50%)",
      "radial-gradient(ellipse at 80% 15%, rgba(93,138,110,0.20) 0%, transparent 45%)",
      "radial-gradient(ellipse at 60% 85%, rgba(210,180,140,0.25) 0%, transparent 50%)",
      "linear-gradient(160deg, #f5ede0 0%, #eef5ee 50%, #f5f0e5 100%)"
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
