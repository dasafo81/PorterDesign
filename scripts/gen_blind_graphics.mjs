// Generuje grafiki SVG modeli rolet rzymskich i materiałów żaluzji -> public/img/{rolety,zaluzje}
// Użycie: node scripts/gen_blind_graphics.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "img");
mkdirSync(join(ROOT, "rolety"), { recursive: true });
mkdirSync(join(ROOT, "zaluzje"), { recursive: true });

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const f = (n) => +n.toFixed(1);

// ── ROLETY RZYMSKIE (200x120) ──────────────────────────────────────────
const X0 = 44, X1 = 156, W = X1 - X0, TOP = 20;
const wrap = (inner, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">` +
  `<defs>${defs}<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f2ee"/><stop offset="1" stop-color="#e9e6e0"/></linearGradient>` +
  `<linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dbde"/><stop offset="1" stop-color="#a9adb3"/></linearGradient></defs>` +
  `<rect width="200" height="120" fill="url(#wall)"/>${inner}` +
  `<rect x="${X0 - 3}" y="9" width="${W + 6}" height="9" rx="2" fill="url(#rail)"/></svg>`;

const shade = (y, h, a = 0.16) =>
  `<rect x="${X0}" y="${y}" width="${W}" height="${h}" fill="#000" opacity="${a}"/>`;

// pojedynczy fałd: wypukły pas tkaniny od y do y+h, z cieniem u dołu
function fold(y, h, col, hi = "#fff") {
  return `<path d="M${X0} ${y} H${X1} V${y + h} Q${(X0 + X1) / 2} ${y + h + 4} ${X0} ${y + h} Z" fill="${col}"/>` +
    `<rect x="${X0}" y="${y}" width="${W}" height="${h * 0.35}" fill="${hi}" opacity=".35"/>` +
    `<path d="M${X0} ${y + h} Q${(X0 + X1) / 2} ${y + h + 4} ${X1} ${y + h}" stroke="#000" stroke-opacity=".22" stroke-width="1.2" fill="none"/>`;
}

const rolety = {};

rolety.relax = (() => { // miękkie, swobodne fałdy z falistym dołem
  let s = `<rect x="${X0}" y="${TOP - 2}" width="${W}" height="6" fill="#cdbfa8"/>`;
  const cols = ["#dccfba", "#d4c6af", "#dccfba", "#d4c6af"];
  for (let i = 0; i < 4; i++) s += fold(TOP + 4 + i * 19, 20, cols[i]);
  s += `<path d="M${X0} 100 Q${X0 + 14} 110 ${X0 + 28} 100 T${X0 + 56} 100 T${X0 + 84} 100 T${X1} 100 V96 H${X0} Z" fill="#d4c6af"/>`;
  return wrap(s);
})();

rolety.print = (() => { // płaska tkanina z nadrukiem (liście)
  const defs = `<pattern id="pr" width="28" height="26" patternUnits="userSpaceOnUse"><rect width="28" height="26" fill="#eef1f3"/>` +
    `<path d="M6 20 Q8 8 18 6 Q16 18 6 20Z" fill="#7fa3b8"/><path d="M6 20 L16 8" stroke="#eef1f3" stroke-width=".8"/>` +
    `<circle cx="23" cy="19" r="2.4" fill="#c9d8e0"/><circle cx="4" cy="6" r="1.6" fill="#c9d8e0"/></pattern>`;
  let s = `<rect x="${X0}" y="${TOP - 2}" width="${W}" height="82" fill="url(#pr)"/>`;
  for (let i = 1; i < 4; i++) s += `<line x1="${X0}" y1="${TOP + i * 20}" x2="${X1}" y2="${TOP + i * 20}" stroke="#000" stroke-opacity=".16" stroke-width="1.2"/>`;
  s += `<rect x="${X0}" y="98" width="${W}" height="4" fill="#9db3c0"/>`;
  return wrap(s, defs);
})();

rolety.back = (() => { // gładki front, głębokie cienie fałdów (tunele z tyłu)
  let s = "";
  for (let i = 0; i < 4; i++) s += fold(TOP - 2 + i * 21, 22, i % 2 ? "#c9c1b4" : "#d3ccc0", "#fff");
  s += shade(TOP - 2, 84, 0.04);
  s += `<rect x="${X0}" y="100" width="${W}" height="3" fill="#9a9183"/>`;
  return wrap(s);
})();

rolety.front = (() => { // widoczne pręty/tunele na froncie
  let s = "";
  for (let i = 0; i < 4; i++) {
    const y = TOP - 2 + i * 21;
    s += fold(y, 22, "#d8d0c4");
    s += `<rect x="${X0}" y="${y + 19}" width="${W}" height="3.4" rx="1.7" fill="#8f877b"/>` +
      `<rect x="${X0}" y="${y + 19}" width="${W}" height="1.2" fill="#fff" opacity=".35"/>`;
  }
  s += `<rect x="${X0}" y="99" width="${W}" height="3" fill="#8f877b"/>`;
  return wrap(s);
})();

rolety.cascade = (() => { // kaskada — nachodzące zaokrąglone fałdy
  let s = `<rect x="${X0}" y="${TOP - 2}" width="${W}" height="16" fill="#cfd4c6"/>`;
  const cols = ["#d9ddcf", "#cfd4c6", "#d9ddcf", "#cfd4c6", "#d9ddcf"];
  for (let i = 0; i < 5; i++) {
    const y = TOP + 8 + i * 15;
    s += `<path d="M${X0} ${y} Q${(X0 + X1) / 2} ${y + 22} ${X1} ${y} V${y + 8} Q${(X0 + X1) / 2} ${y + 30} ${X0} ${y + 8} Z" fill="${cols[i]}"/>` +
      `<path d="M${X0} ${y} Q${(X0 + X1) / 2} ${y + 22} ${X1} ${y}" stroke="#000" stroke-opacity=".2" stroke-width="1.2" fill="none"/>` +
      `<path d="M${X0 + 6} ${y + 3} Q${(X0 + X1) / 2} ${y + 22} ${X1 - 6} ${y + 3}" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" fill="none"/>`;
  }
  return wrap(s);
})();

rolety.duo = (() => { // dwie warstwy: przezierna + zaciemniająca, przesunięte pasy
  let s = "";
  for (let i = 0; i < 4; i++) {
    const y = TOP - 2 + i * 21;
    s += fold(y, 22, "#cfc6b8");
    s += `<path d="M${X0} ${y + 11} H${X1} V${y + 22} Q${(X0 + X1) / 2} ${y + 26} ${X0} ${y + 22} Z" fill="#eef0f3" opacity=".78"/>`;
    s += `<line x1="${X0}" y1="${y + 11}" x2="${X1}" y2="${y + 11}" stroke="#fff" stroke-opacity=".9" stroke-width="1"/>`;
  }
  s += `<rect x="${X0}" y="100" width="${W}" height="3" fill="#8f877b"/>`;
  return wrap(s);
})();

rolety.podszewka = (() => { // przekrój: tkanina + podszewka
  let s = fold(TOP - 2, 38, "#d8d0c4") + fold(TOP + 38, 38, "#d8d0c4");
  s += `<path d="M${X0} 52 H${X1}" stroke="#7e8a96" stroke-width="2" stroke-dasharray="4 3"/>`;
  s += `<rect x="${X0}" y="${TOP + 56}" width="${W}" height="14" fill="#5c6670" opacity=".85"/>` +
    `<text x="100" y="${TOP + 66.5}" font-family="Arial,sans-serif" font-size="8" text-anchor="middle" fill="#fff">PODSZEWKA</text>`;
  return wrap(s);
})();

const chain = (beads, hi, name) => { // łańcuszek sterujący (pętla z kulek)
  let s = `<rect x="86" y="14" width="28" height="12" rx="4" fill="#e2e4e7" stroke="#b9bdc3"/>` +
    `<circle cx="100" cy="20" r="4" fill="#c4c8ce"/>`;
  for (let y = 28; y < 108; y += 6) {
    for (const x of [93, 107]) s += `<circle cx="${x}" cy="${y}" r="2.6" fill="${beads}"/><circle cx="${x - 0.8}" cy="${y - 0.8}" r="0.9" fill="${hi}"/>`;
  }
  s += `<path d="M93 108 Q100 118 107 108" stroke="${beads}" stroke-width="2.4" fill="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice"><rect width="200" height="120" fill="#f4f2ee"/>${s}</svg>`;
};
rolety["lancuszek-bialy"] = chain("#f7f7f7", "#ffffff", "bialy").replaceAll('fill="#f7f7f7"', 'fill="#f6f6f6" stroke="#b4b8be" stroke-width=".9"');
rolety["lancuszek-metalowy"] = chain("#9aa0a8", "#e6e9ed", "metalowy");

// ── ŻALUZJE (120x120) ──────────────────────────────────────────────────
function venetian({ slat, slatHi, slatLo, slatH, grain, grainCol, node }) {
  let s = `<rect width="120" height="120" fill="#f4f2ee"/>`;
  s += `<rect x="12" y="8" width="96" height="8" rx="2" fill="#bfc3c9"/>`;
  const step = slatH + 1.4;
  let y = 18, n = 0;
  while (y + slatH < 108) {
    s += `<rect x="14" y="${f(y)}" width="92" height="${slatH}" rx="${f(slatH / 3)}" fill="${slat}"/>` +
      `<rect x="14" y="${f(y)}" width="92" height="${f(slatH * 0.38)}" rx="${f(slatH / 3)}" fill="${slatHi}" opacity=".7"/>` +
      `<rect x="14" y="${f(y + slatH * 0.8)}" width="92" height="${f(slatH * 0.2)}" fill="${slatLo}" opacity=".55"/>`;
    if (grain) for (let k = 0; k < 5; k++) {
      const gx = 14 + rnd() * 78, gl = 6 + rnd() * 16, gy = y + slatH * (0.25 + rnd() * 0.5);
      s += `<line x1="${f(gx)}" y1="${f(gy)}" x2="${f(Math.min(gx + gl, 104))}" y2="${f(gy)}" stroke="${grainCol}" stroke-opacity=".5" stroke-width=".7"/>`;
    }
    if (node) for (const nx of [36, 66, 94]) if (rnd() > .35) s += `<rect x="${nx + f(rnd() * 4)}" y="${f(y)}" width="1.6" height="${slatH}" fill="${grainCol}" opacity=".55"/>`;
    y += step; n++;
  }
  for (const x of [30, 90]) s += `<line x1="${x}" y1="16" x2="${x}" y2="${f(y)}" stroke="#7d7a74" stroke-width="1.1" opacity=".8"/>`;
  s += `<rect x="12" y="${f(y)}" width="96" height="5" rx="2" fill="#bfc3c9"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">${s}</svg>`;
}
const zaluzje = {
  aluminium: venetian({ slat: "#c9ced4", slatHi: "#f4f6f8", slatLo: "#8e959e", slatH: 5 }),
  bamboo:    venetian({ slat: "#c9a96a", slatHi: "#e6cf98", slatLo: "#8c6d36", slatH: 9, grain: true, grainCol: "#7a5a28", node: true }),
  basswood:  venetian({ slat: "#e0c9a2", slatHi: "#f3e5c8", slatLo: "#a88d62", slatH: 9, grain: true, grainCol: "#a58a5c" }),
  abachi:    venetian({ slat: "#efe3cc", slatHi: "#fbf4e6", slatLo: "#c3b08b", slatH: 9, grain: true, grainCol: "#b9a47c" }),
  primewood: venetian({ slat: "#8a6446", slatHi: "#b08461", slatLo: "#553a26", slatH: 9, grain: true, grainCol: "#3f2a1a" }),
};

for (const [k, v] of Object.entries(rolety)) writeFileSync(join(ROOT, "rolety", k + ".svg"), v);
for (const [k, v] of Object.entries(zaluzje)) writeFileSync(join(ROOT, "zaluzje", k + ".svg"), v);
console.log("OK:", Object.keys(rolety).length, "rolet,", Object.keys(zaluzje).length, "żaluzji");
