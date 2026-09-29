// Import cennikow/katalogow (CSV / XLSX) do catalog_items i cennikow uslug.
// Czysta logika (bez React/DOM) — testowana w scripts/test_catalog_import.mjs.

// ── Pola docelowe ───────────────────────────────────────────────────────
// key = kolumna w catalog_items; alias = nazwy naglowkow rozpoznawane automatycznie
// (znormalizowane: male litery, bez polskich znakow i interpunkcji).
export var CATALOG_FIELDS = [
  { key: "name",           label: "Nazwa / kod",         required: true,  aliases: ["nazwa", "kod", "nazwa tkaniny", "wzor", "produkt", "artykul", "indeks", "name"] },
  { key: "price",          label: "Cena sprzedazy",      aliases: ["cena", "cena sprzedazy", "cena brutto", "brutto", "cena detal", "detal", "price"] },
  { key: "purchase_price", label: "Cena zakupu",         aliases: ["zakup", "cena zakupu", "cena netto", "netto", "hurt", "cena hurtowa", "purchase"] },
  { key: "unit",           label: "Jednostka",           aliases: ["jm", "j m", "jednostka", "unit"] },
  { key: "meta",           label: "Producent / kolekcja", aliases: ["producent", "dostawca", "kolekcja", "marka", "brand", "supplier"] },
  { key: "height_cm",      label: "Szerokosc beli (cm)", aliases: ["szerokosc", "szerokosc beli", "szer", "wysokosc", "width", "szerokosc cm"] },
  { key: "composition",    label: "Sklad",               aliases: ["sklad", "skład", "sklad tkaniny", "composition"] },
  { key: "weight_gsm",     label: "Gramatura (g/m2)",    aliases: ["gramatura", "gsm", "waga", "g m2", "weight"] },
  { key: "belka_price",    label: "Cena belkowa",        aliases: ["belkowa", "cena belkowa", "belka", "cena belka"] },
  { key: "shrinkage_pct",  label: "Kurczliwosc (%)",     aliases: ["kurczliwosc", "skurcz", "shrinkage"] },
  { key: "flame_retardant", label: "Trudnopalna",        bool: true, aliases: ["trudnopalna", "trudnopalne", "fr", "flame retardant"] },
  { key: "soundproof",     label: "Dzwiekoszczelna",     bool: true, aliases: ["dzwiekoszczelna", "dzwiekoszczelne", "soundproof"] }
];

export var CATALOG_GROUPS = [
  { id: "tkaniny", label: "Tkaniny", defaultUnit: "zł/mb" },
  { id: "tapety",  label: "Tapety",  defaultUnit: "zł/rol" },
  { id: "inne",    label: "Inne / własne", defaultUnit: "zł" }
];

export var SERVICE_FIELDS = [
  { key: "service", label: "Usługa",            required: true, aliases: ["usluga", "nazwa", "service", "pozycja"] },
  { key: "net",     label: "Cena netto (zakup)",     aliases: ["netto", "cena netto", "cena", "koszt", "net"] },
  { key: "client",  label: "Cena dla klienta",       aliases: ["klient", "cena dla klienta", "cena klienta", "brutto", "cena sprzedazy", "client"] }
];

export function normHeader(s) {
  return String(s == null ? "" : s).trim().toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// ── Parsowanie CSV ──────────────────────────────────────────────────────
// Rozpoznaje separator (; , tab), cudzyslowy z "" i BOM. Zwraca tablice wierszy.
export function parseCSV(text) {
  text = String(text == null ? "" : text).replace(/^﻿/, "");
  var firstLine = text.split(/\r?\n/, 1)[0] || "";
  var delim = ";";
  var best = -1;
  [";", ",", "\t"].forEach(function(d) {
    var n = firstLine.split(d).length;
    if (n > best) { best = n; delim = d; }
  });
  var rows = [], row = [], cur = "", inQ = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(function(r) { return r.some(function(c) { return String(c).trim() !== ""; }); });
}

// Plik (File) -> tablica wierszy. XLSX ladowany leniwie, zeby nie obciazac glownego bundla.
export function readTableFile(file) {
  var name = (file && file.name || "").toLowerCase();
  if (/\.xlsx$/.test(name)) {
    return import("read-excel-file/browser").then(function(m) {
      var read = m.default || m.readSheet || m;
      return read(file);
    }).then(function(res) {
      // wersje biblioteki zwracaja albo wiersze, albo [{sheet,data}]
      var rows = Array.isArray(res) && res.length && res[0] && res[0].data ? res[0].data : res;
      return rows.map(function(r) { return r.map(function(c) { return c == null ? "" : c; }); })
        .filter(function(r) { return r.some(function(c) { return String(c).trim() !== ""; }); });
    });
  }
  if (/\.xls$/.test(name)) return Promise.reject(new Error("Format .xls nie jest obsługiwany — zapisz plik jako .xlsx lub CSV."));
  return file.text().then(parseCSV);
}

// ── Mapowanie kolumn ────────────────────────────────────────────────────
// Zwraca tablice indeksow kolumn dla kazdego pola (albo -1). Kazda kolumna max raz.
export function guessMapping(headers, fields) {
  var norm = headers.map(normHeader);
  var used = {};
  var map = {};
  // Najpierw dokladne dopasowania, potem "zawiera" — zeby "cena zakupu" nie trafila do "cena".
  [true, false].forEach(function(exact) {
    fields.forEach(function(f) {
      if (map[f.key] != null && map[f.key] >= 0) return;
      var idx = -1;
      for (var i = 0; i < norm.length && idx < 0; i++) {
        if (used[i] || !norm[i]) continue;
        var hit = f.aliases.some(function(a) {
          a = normHeader(a);
          return exact ? norm[i] === a : (norm[i].indexOf(a) !== -1 && a.length >= 4);
        });
        if (hit) idx = i;
      }
      if (idx >= 0) { used[idx] = 1; map[f.key] = idx; }
      else if (map[f.key] == null) map[f.key] = -1;
    });
  });
  return map;
}

// Liczba w polskim lub angielskim zapisie: "1 234,50", "1,234.50", "12,5 zl", 12.5
export function parseNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  var s = String(v).trim().replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" ) return null;
  var lastC = s.lastIndexOf(","), lastD = s.lastIndexOf(".");
  if (lastC >= 0 && lastD >= 0) {
    // separator dziesietny = ten, ktory wystepuje ostatni
    s = lastC > lastD ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastC >= 0) s = s.replace(",", ".");
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function parseBool(v) {
  var s = normHeader(v);
  return s === "tak" || s === "t" || s === "1" || s === "true" || s === "yes" || s === "x";
}

// ── Budowa wierszy do zapisu ────────────────────────────────────────────
// rows: wiersze danych (bez naglowka); mapping: {key: colIdx}; opts: {groupId, defaultUnit}
// Zwraca [{line, name, payload, errors[], warnings[]}].
export function buildCatalogRows(rows, mapping, opts) {
  var seen = {};
  return rows.map(function(r, i) {
    function cell(k) { var ix = mapping[k]; return ix != null && ix >= 0 ? r[ix] : undefined; }
    var errors = [], warnings = [];
    var name = String(cell("name") == null ? "" : cell("name")).trim();
    var p = { group_id: opts.groupId, name: name, base_key: null };
    CATALOG_FIELDS.forEach(function(f) {
      if (f.key === "name") return;
      var raw = cell(f.key);
      if (raw === undefined || raw === "") return;
      if (f.bool) { p[f.key] = parseBool(raw); return; }
      if (f.key === "unit" || f.key === "meta" || f.key === "composition") { p[f.key] = String(raw).trim(); return; }
      var n = parseNumber(raw);
      if (n == null) warnings.push(f.label + ": „" + raw + "” nie jest liczbą — pominięto");
      else if (n < 0) warnings.push(f.label + ": wartość ujemna — pominięto");
      else p[f.key] = n;
    });
    if (!p.unit) p.unit = opts.defaultUnit || "zł";
    if (!name) errors.push("Brak nazwy");
    else {
      var k = name.toLowerCase();
      if (seen[k]) errors.push("Duplikat nazwy w pliku (wiersz " + seen[k] + ")");
      else seen[k] = i + 2;
    }
    if (name && p.price == null) warnings.push("Brak ceny sprzedaży");
    return { line: i + 2, name: name, payload: p, errors: errors, warnings: warnings };
  });
}

export function buildServiceRows(rows, mapping) {
  return rows.map(function(r, i) {
    function cell(k) { var ix = mapping[k]; return ix != null && ix >= 0 && r[ix] != null ? String(r[ix]).trim() : ""; }
    var errors = [];
    var service = cell("service");
    if (!service) errors.push("Brak nazwy usługi");
    return { line: i + 2, name: service, payload: { service: service, net: cell("net"), client: cell("client") }, errors: errors, warnings: [] };
  });
}

// ── Dopasowanie do istniejacych pozycji (upsert po grupie + nazwie) ────────
export function planUpsert(built, existingRows, groupId) {
  var byName = {};
  (existingRows || []).forEach(function(r) {
    if (r.group_id === groupId && !r.base_key && r.name) byName[r.name.trim().toLowerCase()] = r;
  });
  return built.map(function(b) {
    if (b.errors.length) return Object.assign({}, b, { action: "skip" });
    var ex = byName[b.name.toLowerCase()];
    return Object.assign({}, b, ex ? { action: "update", rowId: ex.id } : { action: "insert" });
  });
}

// ── Szablony do pobrania ────────────────────────────────────────────────
export function templateCSV(kind) {
  var lines = kind === "uslugi"
    ? [["Usluga", "Cena netto", "Cena dla klienta"],
       ["Szycie proste", "7 zł/mb", "15 zł/mb"],
       ["Poszewka na poduszkę", "20 zł/szt.", "40 zł/szt."]]
    : [["Nazwa", "Producent", "Cena sprzedazy", "Cena zakupu", "Jednostka", "Szerokosc (cm)", "Sklad", "Gramatura", "Trudnopalna"],
       ["Aisha", "Nazwa dostawcy", "180", "90", "zł/mb", "300", "100% PES", "320", "nie"],
       ["Nam", "Nazwa dostawcy", "210,50", "105", "zł/mb", "280", "60% CO, 40% LI", "", "tak"]];
  var body = lines.map(function(l) { return l.map(function(c) { return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(";"); }).join("\r\n");
  return "﻿" + body + "\r\n"; // BOM + ; = Excel PL otwiera bez kreatora
}

// PostgREST przy zbiorczym INSERT wymaga jednolitych kluczy (brakujace = NULL, a flagi sa NOT NULL),
// dlatego wstawiane wiersze dostaja komplet pol; aktualizacje wysylaja tylko to, co jest w pliku.
export function normalizeInsert(payload) {
  var out = {};
  CATALOG_FIELDS.forEach(function(f) {
    out[f.key] = payload[f.key] !== undefined ? payload[f.key] : (f.bool ? false : null);
  });
  out.group_id = payload.group_id;
  out.base_key = null;
  return out;
}
