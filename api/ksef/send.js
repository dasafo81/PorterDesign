// api/ksef/send.js
// Wysyła fakturę sprzedażową do KSeF (FA(3) XML).
// POST { invoiceId, sessionToken, baseUrl }
//   → pobiera fakturę z Supabase
//   → generuje XML FA(3)
//   → wysyła do KSeF online/Invoice/Send
//   → zapisuje ksef_number, ksef_status w Supabase
//   → zwraca { ksefNumber, referenceNumber }

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
  });
}

async function verifyUser(req) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return { ok: false, status: 500, message: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return { ok: false, status: 401, message: 'missing token' };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` } });
  if (!r.ok) return { ok: false, status: 401, message: 'invalid jwt' };
  const user = await r.json();
  const tenantId = user && user.app_metadata && user.app_metadata.tenant_id;
  if (!tenantId) return { ok: false, status: 403, message: 'no tenant_id' };
  return { ok: true, tenantId, service: SERVICE };
}

// Formatuje datę do YYYY-MM-DD
function isoDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Stawka VAT → kod FA(3)
function vatCode(rate) {
  if (rate === 23) return 'A';  // 23%
  if (rate === 8)  return 'B';  // 8%
  if (rate === 5)  return 'C';  // 5%
  if (rate === 0)  return 'D';  // 0%
  if (rate === -1) return 'E';  // zw
  return 'A';
}

function round2(n) { return Math.round((+(n || 0)) * 100) / 100; }
function fmt2(n)   { return round2(n).toFixed(2); }

// Generuje XML FA(3) zgodny ze schemą MF
// Dokumentacja: ksef.podatki.gov.pl/ksef-na-okres-obligatoryjny/struktura-logiczna-fa-3
function buildFA3(inv, items, settings) {
  const s = inv.seller_snapshot || {};
  const sellerNip = (s.nip || settings.seller_nip || '').replace(/[\s\-]/g, '');
  const buyerNip  = (inv.buyer_nip || '').replace(/[\s\-]/g, '');

  // Grupowanie pozycji po stawce VAT dla StawkiPodatku
  const vatGroups = {};
  (items || []).forEach(function(it) {
    const k = it.vat_rate;
    if (!vatGroups[k]) vatGroups[k] = { net: 0, vat: 0 };
    vatGroups[k].net += round2(it.line_net);
    vatGroups[k].vat += round2(it.line_vat);
  });

  const totalNet   = fmt2(items.reduce(function(a, i) { return a + round2(i.line_net);   }, 0));
  const totalVat   = fmt2(items.reduce(function(a, i) { return a + round2(i.line_vat);   }, 0));
  const totalGross = fmt2(items.reduce(function(a, i) { return a + round2(i.line_gross);  }, 0));

  // Pozycje
  const pozycje = items.map(function(it, idx) {
    const vc = vatCode(it.vat_rate);
    return `
    <Pozycja>
      <NrWiersza>${idx + 1}</NrWiersza>
      <P_2B>${escXml(it.name || '')}</P_2B>
      <P_3B>${fmt2(it.quantity)}</P_3B>
      <P_4>${escXml(it.unit || 'szt')}</P_4>
      <P_5>${fmt2(it.unit_net)}</P_5>
      <P_6>${fmt2(it.line_net)}</P_6>
      <P_7>${it.vat_rate === -1 ? 'zw' : fmt2(it.vat_rate)}</P_7>
      <P_8A>${vc}</P_8A>
      <P_8B>${fmt2(it.line_vat)}</P_8B>
      <P_9A>${fmt2(it.line_gross)}</P_9A>
      ${it.pkwiu ? `<P_PKWIU>${escXml(it.pkwiu)}</P_PKWIU>` : ''}
    </Pozycja>`;
  }).join('');

  // Stawki VAT (sumy per stawka)
  const stawki = Object.keys(vatGroups).map(function(k) {
    const g = vatGroups[k];
    const vc = vatCode(+k);
    return `
    <StawkiPodatku>
      <P_13_${vc}>${fmt2(g.net)}</P_13_${vc}>
      <P_14_${vc}>${fmt2(g.vat)}</P_14_${vc}>
    </StawkiPodatku>`;
  }).join('');

  // Sposób płatności → kod FA(3)
  // Oficjalne kody FA(3): 1-gotówka, 2-karta, 3-bon, 4-czek, 5-kredyt, 6-przelew, 7-mobilna.
  const payMap = { 'przelew': '6', 'gotówka': '1', 'karta': '2', 'BLIK': '7' };
  const payCode = payMap[inv.payment_method] || '6';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/types"
         xmlns:etd="http://ksef.mf.gov.pl/schema/etd/types"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <DataWytworzeniaFa>${new Date().toISOString().replace('Z', '+00:00')}</DataWytworzeniaFa>
    <NrFaKSeF>${escXml(inv.number || '')}</NrFaKSeF>
    <SystemInfo>PorterDesign</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${escXml(sellerNip)}</NIP>
      <PelnaNazwa>${escXml(s.name || settings.seller_name || '')}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escXml((s.address || settings.seller_address || '') + ' ' + (s.postal || settings.seller_postal || ''))}</AdresL1>
      <AdresL2>${escXml(s.city || settings.seller_city || '')}</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      ${buyerNip ? `<NIP>${escXml(buyerNip)}</NIP>` : ''}
      <PelnaNazwa>${escXml(inv.buyer_name || '')}</PelnaNazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escXml((inv.buyer_address || '') + ' ' + (inv.buyer_postal || ''))}</AdresL1>
      <AdresL2>${escXml(inv.buyer_city || '')}</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${isoDate(inv.issue_date)}</P_1>
    <P_1M>${isoDate(inv.sale_date || inv.issue_date)}</P_1M>
    <P_2>${escXml(inv.number || '')}</P_2>
    <P_15>${totalGross}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <P_19>2</P_19>
      <P_22>2</P_22>
      <P_23>2</P_23>
      <P_PMarzy>2</P_PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <DodatkowyOpis>
      ${inv.notes ? `<P_Opis>${escXml(inv.notes)}</P_Opis>` : ''}
    </DodatkowyOpis>
    <FaWiersz>${pozycje}
    </FaWiersz>
    ${stawki}
    <P_13_Razem>${totalNet}</P_13_Razem>
    <P_14_Razem>${totalVat}</P_14_Razem>
    <Platnosc>
      <Zaplacono>2</Zaplacono>
      <DataZaplaty>${isoDate(inv.due_date)}</DataZaplaty>
      <FormaPlatnosci>${payCode}</FormaPlatnosci>
      ${s.bank || settings.seller_bank ? `<NrRachunku>${escXml((s.bank || settings.seller_bank || '').replace(/\s/g, ''))}</NrRachunku>` : ''}
    </Platnosc>
  </Fa>
</Faktura>`;

  return xml;
}

function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
  const { invoiceId, sessionToken, baseUrl } = body || {};
  if (!invoiceId || !sessionToken || !baseUrl) {
    return json({ error: 'invoiceId, sessionToken i baseUrl są wymagane' }, 400);
  }

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Pobierz fakturę + pozycje + ustawienia (przez service_role)
  const [invR, settR] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}&tenant_id=eq.${auth.tenantId}&select=*,invoice_items(*)`, { headers: sbH }),
    fetch(`${SB_URL}/rest/v1/invoice_settings?tenant_id=eq.${auth.tenantId}&select=*`, { headers: sbH }),
  ]);
  if (!invR.ok) return json({ error: 'Błąd pobierania faktury z DB' }, 500);
  const invRows = await invR.json();
  const inv = invRows && invRows[0];
  if (!inv) return json({ error: 'Faktura nie znaleziona lub brak dostępu' }, 404);
  if (inv.status !== 'issued') return json({ error: 'Tylko wystawione faktury można wysłać do KSeF' }, 400);
  if (inv.ksef_status === 'confirmed') return json({ error: 'Faktura już potwierdzona w KSeF (nr: ' + inv.ksef_number + ')' }, 400);

  const settings = settR.ok ? ((await settR.json()) || [])[0] || {} : {};
  const items = inv.invoice_items || [];

  // Generuj XML
  const xml = buildFA3(inv, items, settings);

  // Zakoduj XML → base64
  const xmlB64 = btoa(unescape(encodeURIComponent(xml)));

  // Wyślij do KSeF
  const sendR = await fetch(`${baseUrl}/online/Invoice/Send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'SessionToken': sessionToken,
    },
    body: JSON.stringify({
      invoiceHash: {
        fileSize: new TextEncoder().encode(xml).length,
        hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: await sha256b64(xml) },
      },
      invoicePayload: {
        type: 'plain',
        invoiceBody: xmlB64,
      },
    }),
  });

  const sendText = await sendR.text();
  if (!sendR.ok) {
    // Zapisz błąd w DB
    await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: 'PATCH', headers: sbH,
      body: JSON.stringify({ ksef_status: 'error', ksef_error: sendText.slice(0, 500) }),
    });
    return json({ error: 'KSeF odrzucił fakturę', detail: sendText }, 502);
  }

  let sendData;
  try { sendData = JSON.parse(sendText); } catch (e) { sendData = {}; }
  const referenceNumber = sendData.referenceNumber || '';

  // Sprawdź status (może być async – polling)
  let ksefNumber = sendData.ksefReferenceNumber || '';

  // Jeśli numer KSeF nie przyszedł od razu — zapisz jako 'sent' (pending)
  const ksefStatus = ksefNumber ? 'confirmed' : 'sent';

  // Zapisz wynik w Supabase
  await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${invoiceId}`, {
    method: 'PATCH', headers: sbH,
    body: JSON.stringify({
      ksef_status: ksefStatus,
      ksef_number: ksefNumber || null,
      ksef_mode: 'online',
      ksef_sent_at: new Date().toISOString(),
      ksef_error: null,
      xml_payload: xml,
    }),
  });

  return json({ ok: true, ksefStatus, ksefNumber, referenceNumber, xmlLength: xml.length });
}

// SHA-256 → base64 (Web Crypto, Edge runtime)
async function sha256b64(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
