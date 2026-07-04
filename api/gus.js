// api/gus.js
// Wyszukiwanie podmiotu w GUS REGON (API BIR 1.1) po NIP.
// Zwraca pełną nazwę + pełny adres (także dla JDG, których Biała Lista nie pokrywa).
// Wymaga darmowego klucza GUS w env: GUS_API_KEY (rejestracja: https://api.stat.gov.pl/Home/RegonApi)
//
// GET /api/gus?nip=0000000000
// → { name, street, postal, city } lub { error }

export const config = { runtime: 'edge' };

const BIR_URL = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const NS = 'http://CIS/BIR/PUBL/2014/07';

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

function envelope(action, bodyXml) {
  return '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="' + NS + '">'
    + '<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">'
    + '<wsa:To>' + BIR_URL + '</wsa:To>'
    + '<wsa:Action>' + NS + '/IUslugaBIRzewnPubl/' + action + '</wsa:Action>'
    + '</soap:Header>'
    + '<soap:Body>' + bodyXml + '</soap:Body>'
    + '</soap:Envelope>';
}

async function soapCall(action, bodyXml, sid) {
  const headers = { 'Content-Type': 'application/soap+xml; charset=utf-8' };
  if (sid) headers.sid = sid;
  const r = await fetch(BIR_URL, { method: 'POST', headers, body: envelope(action, bodyXml) });
  const text = await r.text();
  if (!r.ok) throw new Error('GUS HTTP ' + r.status);
  return text; // odpowiedź jest w MIME multipart — parsujemy regexami po tagach
}

function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1].trim() : '';
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#xD;/g, '')
    .replace(/&amp;/g, '&');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);

  const KEY = process.env.GUS_API_KEY;
  if (!KEY) return json({ error: 'GUS_API_KEY not configured' }, 500);

  const url = new URL(req.url);
  const nip = (url.searchParams.get('nip') || '').replace(/[\s\-]/g, '');
  if (!/^\d{10}$/.test(nip)) return json({ error: 'NIP musi mieć 10 cyfr' }, 400);

  let sid = '';
  try {
    // 1. Zaloguj → sid
    const loginXml = await soapCall('Zaloguj',
      '<ns:Zaloguj><ns:pKluczUzytkownika>' + KEY + '</ns:pKluczUzytkownika></ns:Zaloguj>');
    sid = tag(loginXml, 'ZalogujResult');
    if (!sid) return json({ error: 'Logowanie do GUS nieudane — sprawdź GUS_API_KEY' }, 502);

    // 2. DaneSzukajPodmioty po NIP
    const searchXml = await soapCall('DaneSzukajPodmioty',
      '<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania>'
      + '<dat:Nip xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">' + nip + '</dat:Nip>'
      + '</ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>', sid);

    const inner = unescapeXml(tag(searchXml, 'DaneSzukajPodmiotyResult'));
    if (!inner || inner.indexOf('<dane>') === -1 || tag(inner, 'ErrorCode')) {
      return json({ error: 'Nie znaleziono podmiotu w GUS dla NIP: ' + nip }, 404);
    }

    const name   = tag(inner, 'Nazwa');
    const ulica  = tag(inner, 'Ulica');
    const nrNier = tag(inner, 'NrNieruchomosci');
    const nrLok  = tag(inner, 'NrLokalu');
    const city   = tag(inner, 'Miejscowosc');
    const postal = tag(inner, 'KodPocztowy');

    // Ulica bywa pusta (małe miejscowości) — wtedy adresem jest miejscowość + numer
    let street = ulica || city;
    if (nrNier) street += ' ' + nrNier + (nrLok ? '/' + nrLok : '');

    return json({ name, street, postal, city });
  } catch (e) {
    return json({ error: 'Błąd połączenia z GUS: ' + (e && e.message) }, 502);
  } finally {
    // 3. Wyloguj (best-effort)
    if (sid) {
      try { await soapCall('Wyloguj', '<ns:Wyloguj><ns:pIdentyfikatorSesji>' + sid + '</ns:pIdentyfikatorSesji></ns:Wyloguj>', sid); }
      catch (_) { /* ignore */ }
    }
  }
}
