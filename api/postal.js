// api/postal.js
// Wyszukiwanie kodu pocztowego dla adresu przez Uniwersalna Usluge Geokodowania GUGiK
// (UUG, panstwowy rejestr PRG). Darmowa, bez klucza. Proxy po stronie serwera,
// zeby nie zalezec od CORS uslugi.
//
// GET /api/postal?addr=ul. Majdanska 13/77&city=Warszawa
// -> { code, city, street, number } lub { error }
//
// Zwracamy kod TYLKO przy pewnym dopasowaniu: to samo miasto, ten sam numer
// budynku i ta sama ulica (po normalizacji). UUG zwraca tez podobne ulice
// (Majdanska -> Marokanska, Gdanska), wiec samo "accuracy" nie wystarcza.

export const config = { runtime: 'edge' };

const UUG_URL = 'https://services.gugik.gov.pl/uug/';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
  });
}

const PREFIX_RE = /^(ul\.?|ulica|al\.?|aleja|aleje|pl\.?|plac|os\.?|osiedle|rondo|skwer|bulw\.?|bulwar|wybrze[zż]e)\s+/i;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(PREFIX_RE, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "ul. Majdanska 13/77" -> { street: "ul. Majdanska", number: "13" }
// "ul. Dluga 3 m. 4" / "ul. 3 Maja 5" / "al. Jana Pawla II 12/4"
function parseStreet(addr) {
  const a = String(addr || '').trim().replace(/,\s*$/, '');
  const m = a.match(/^(.*?)\s+(\d+[A-Za-z]?)(?:\s*(?:\/|m\.?\s*|lok\.?\s*)\S*)?$/);
  if (!m) return null;
  return { street: m[1].replace(/,\s*$/, '').trim(), number: m[2].toUpperCase() };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);

  const url = new URL(req.url);
  const addr = (url.searchParams.get('addr') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  if (!addr || !city) return json({ error: 'Podaj adres i miasto' }, 400);

  const p = parseStreet(addr);
  if (!p || !p.street) return json({ error: 'Nie rozpoznano ulicy i numeru' }, 422);

  const q = UUG_URL + '?request=GetAddress&address=' + encodeURIComponent(city + ', ' + p.street.replace(PREFIX_RE, '') + ' ' + p.number);
  let data;
  try {
    const r = await fetch(q, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return json({ error: 'UUG HTTP ' + r.status }, 502);
    data = await r.json();
  } catch (e) {
    return json({ error: 'Brak połączenia z usługą GUGiK' }, 502);
  }

  const results = data && data.results ? Object.values(data.results) : [];
  const wantCity = norm(city), wantStreet = norm(p.street);
  const hit = results.find(function (r) {
    if (!r || !r.code) return false;
    if (norm(r.city) !== wantCity) return false;
    if (String(r.number || '').toUpperCase() !== p.number) return false;
    const s = norm(r.street);
    return s === wantStreet || s.endsWith(' ' + wantStreet) || wantStreet.endsWith(' ' + s);
  });
  if (!hit) return json({ error: 'Nie znaleziono kodu dla tego adresu' }, 404);

  return json({ code: hit.code, city: hit.city, street: hit.street, number: hit.number });
}
