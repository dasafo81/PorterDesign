// Testy czystej logiki importu katalogu: node scripts/test_catalog_import.mjs
import assert from 'node:assert/strict';
import {
  parseCSV, guessMapping, parseNumber, buildCatalogRows, planUpsert, normalizeInsert,
  templateCSV, CATALOG_FIELDS, buildServiceRows, SERVICE_FIELDS
} from '../src/lib/catalogImport.js';

// CSV: srednik, BOM, cudzyslow z separatorem i "" w srodku, CRLF
var csv = '﻿Nazwa;Cena;Zakup\r\n"Aisha; nowa";180,50;90\r\n"Nam ""XL""";210;\r\n\r\n';
var rows = parseCSV(csv);
assert.equal(rows.length, 3);
assert.deepEqual(rows[1], ['Aisha; nowa', '180,50', '90']);
assert.equal(rows[2][0], 'Nam "XL"');
assert.equal(parseCSV('a,b\n1,2')[1][1], '2'); // przecinek jako separator
assert.equal(parseCSV('a\tb\n1\t2')[1][1], '2'); // tab

// liczby
assert.equal(parseNumber('1 234,50'), 1234.5);
assert.equal(parseNumber('1,234.50'), 1234.5);
assert.equal(parseNumber('12,5 zł'), 12.5);
assert.equal(parseNumber(''), null);
assert.equal(parseNumber('abc'), null);
assert.equal(parseNumber(7), 7);

// mapowanie: "Cena zakupu" nie moze zjesc "Cena sprzedazy"
var m = guessMapping(['Kod', 'Cena sprzedaży', 'Cena zakupu', 'Szerokość beli', 'Skład', 'Producent'], CATALOG_FIELDS);
assert.equal(m.name, 0); assert.equal(m.price, 1); assert.equal(m.purchase_price, 2);
assert.equal(m.height_cm, 3); assert.equal(m.composition, 4); assert.equal(m.meta, 5);
assert.equal(guessMapping(['Foo'], CATALOG_FIELDS).name, -1);

// budowa wierszy: duplikat, brak nazwy, zla liczba, domyslna jednostka
var built = buildCatalogRows([
  ['Aisha', '180,5', 'x'], ['aisha', '1', ''], ['', '5', ''], ['Nam', '', '']
], { name: 0, price: 1, purchase_price: 2 }, { groupId: 'tkaniny', defaultUnit: 'zł/mb' });
assert.equal(built[0].errors.length, 0);
assert.equal(built[0].payload.price, 180.5);
assert.equal(built[0].payload.unit, 'zł/mb');
assert.ok(built[0].warnings.some(function(w) { return /zakupu/i.test(w); }));
assert.ok(built[1].errors[0].startsWith('Duplikat'));
assert.equal(built[2].errors[0], 'Brak nazwy');
assert.ok(built[3].warnings.includes('Brak ceny sprzedaży'));

// upsert: tylko wlasne pozycje tej samej grupy (base_key=null), bez rozrozniania wielkosci liter
var plan = planUpsert(built, [
  { id: 'r1', group_id: 'tkaniny', base_key: null, name: 'AISHA' },
  { id: 'r2', group_id: 'tkaniny', base_key: 'tkaniny::Nam', name: 'Nam' },
  { id: 'r3', group_id: 'tapety', base_key: null, name: 'Nam' }
], 'tkaniny');
assert.equal(plan[0].action, 'update'); assert.equal(plan[0].rowId, 'r1');
assert.equal(plan[1].action, 'skip'); assert.equal(plan[2].action, 'skip');
assert.equal(plan[3].action, 'insert');

// insert: jednolite klucze, flagi NOT NULL nie moga byc null
var ni = normalizeInsert(plan[3].payload);
assert.equal(ni.flame_retardant, false); assert.equal(ni.composition, null);
assert.deepEqual(Object.keys(ni).sort(), Object.keys(normalizeInsert({ group_id: 'x' })).sort());

// szablon jest poprawnym wejsciem dla wlasnego parsera i mapowania
var t = parseCSV(templateCSV('katalog'));
var tm = guessMapping(t[0], CATALOG_FIELDS);
['name','price','purchase_price','unit','meta','height_cm','composition','weight_gsm','flame_retardant'].forEach(function(k) { assert.ok(tm[k] >= 0, 'szablon: kolumna ' + k); });
var tb = buildCatalogRows(t.slice(1), tm, { groupId: 'tkaniny' });
assert.ok(tb.every(function(r) { return !r.errors.length; }));
assert.equal(tb[1].payload.price, 210.5); assert.equal(tb[1].payload.flame_retardant, true);

var ts = parseCSV(templateCSV('uslugi'));
var sr = buildServiceRows(ts.slice(1), guessMapping(ts[0], SERVICE_FIELDS));
assert.equal(sr[0].payload.service, 'Szycie proste'); assert.equal(sr[0].payload.client, '15 zł/mb');
console.log('catalogImport: OK');
