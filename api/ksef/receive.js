// api/ksef/receive.js
// Pobiera faktury kosztowe (zakupowe) z KSeF i zapisuje je w Supabase.
// POST { sessionToken, baseUrl, dateFrom?, dateTo? }
//   → GET /online/Query/Invoice/Sync (faktury dla nabywcy)
//   → parsuje podstawowe dane z XML
//   → upsert do tabeli invoices (doc_type='zakup', status='received')
//   → zwraca listę nowych/zaktualizowanych faktur

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

// Prosta ekstrakcja wartości z XML tagiem (nie pełny parser — dla znanych pól)
function xmlVal(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

// Parsuje podstawowe pola faktury z XML FA(3)
function parseInvoiceXml(xml) {
  return {
    number:        xmlVal(xml, 'P_2') || xmlVal(xml, 'NrFaKSeF'),
    issue_date:    xmlVal(xml, 'P_1'),
    sale_date:     xmlVal(xml, 'P_1M') || xmlVal(xml, 'P_1'),
    due_date:      xmlVal(xml, 'DataZaplaty'),
    total_gross:   +(xmlVal(xml, 'P_15') || 0),
    seller_name:   xmlVal(xml, 'PelnaNazwa'),   // pierwsze wystąpienie = sprzedawca
    seller_nip:    xmlVal(xml, 'NIP'),           // pierwsze = sprzedawca
    currency:      xmlVal(xml, 'KodWaluty') || 'PLN',
    notes:         xmlVal(xml, 'P_Opis'),
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = await verifyUser(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
  const { sessionToken, baseUrl, dateFrom, dateTo } = body || {};
  if (!sessionToken || !baseUrl) return json({ error: 'sessionToken i baseUrl są wymagane' }, 400);

  // Zakres dat — domyślnie ostatnie 30 dni
  const now = new Date();
  const from = dateFrom || new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to   = dateTo   || now.toISOString().slice(0, 10);

  // Zapytanie do KSeF — faktury jako nabywca
  // subjectType=2 → podmiot2 (nabywca)
  const queryR = await fetch(`${baseUrl}/online/Query/Invoice/Sync?PageSize=100&PageOffset=0`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'SessionToken': sessionToken,
    },
    body: JSON.stringify({
      queryCriteria: {
        subjectType: 'subject2',
        type: 'incremental',
        acquisitionTimestampThresholdFrom: from + 'T00:00:00.000Z',
        acquisitionTimestampThresholdTo:   to   + 'T23:59:59.999Z',
      },
    }),
  });

  if (!queryR.ok) {
    const t = await queryR.text();
    return json({ error: 'Błąd zapytania do KSeF', detail: t }, 502);
  }

  const queryData = await queryR.json();
  const invoiceHeaders = queryData.invoiceHeaderList || [];

  if (invoiceHeaders.length === 0) {
    return json({ ok: true, fetched: 0, saved: 0, message: 'Brak nowych faktur kosztowych w podanym zakresie.' });
  }

  const sbH = {
    apikey: auth.service,
    Authorization: `Bearer ${auth.service}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const saved = [];
  const errors = [];

  // Dla każdego nagłówka pobierz pełną fakturę i zapisz
  for (const hdr of invoiceHeaders.slice(0, 50)) {  // max 50 na raz
    const ksefNum = hdr.ksefReferenceNumber;
    if (!ksefNum) continue;

    try {
      // Pobierz XML faktury
      const invR = await fetch(`${baseUrl}/online/Invoice/Get/${ksefNum}`, {
        headers: { 'SessionToken': sessionToken },
      });
      if (!invR.ok) { errors.push({ ksefNum, err: 'HTTP ' + invR.status }); continue; }

      // Odpowiedź może być base64
      const invData = await invR.json();
      let xml = '';
      if (invData.invoiceData) {
        try { xml = decodeURIComponent(escape(atob(invData.invoiceData))); } catch (e) { xml = invData.invoiceData; }
      }

      const parsed = xml ? parseInvoiceXml(xml) : {};

      // Sprawdź czy już mamy tę fakturę
      const checkR = await fetch(
        `${SB_URL}/rest/v1/invoices?ksef_number=eq.${encodeURIComponent(ksefNum)}&tenant_id=eq.${auth.tenantId}&select=id`,
        { headers: sbH }
      );
      const existing = checkR.ok ? await checkR.json() : [];

      const record = {
        doc_type:       'zakup',
        status:         'received',
        ksef_status:    'confirmed',
        ksef_number:    ksefNum,
        ksef_mode:      'online',
        number:         parsed.number || ksefNum,
        issue_date:     parsed.issue_date || null,
        sale_date:      parsed.sale_date  || null,
        due_date:       parsed.due_date   || null,
        total_gross:    parsed.total_gross || 0,
        currency:       parsed.currency || 'PLN',
        notes:          parsed.notes || '',
        // Sprzedawca faktury kosztowej trafia jako "nabywca" w naszym schemacie (kto nam wystawił)
        buyer_name:     parsed.seller_name || hdr.subjectName || '',
        buyer_nip:      parsed.seller_nip  || hdr.subjectNip  || '',
        xml_payload:    xml || null,
        seller_snapshot: {},
        updated_at:     new Date().toISOString(),
      };

      if (existing && existing.length > 0) {
        // Aktualizuj istniejącą
        await fetch(`${SB_URL}/rest/v1/invoices?id=eq.${existing[0].id}`, {
          method: 'PATCH', headers: sbH, body: JSON.stringify(record),
        });
        saved.push({ ksefNum, action: 'updated' });
      } else {
        // Wstaw nową
        await fetch(`${SB_URL}/rest/v1/invoices`, {
          method: 'POST', headers: sbH, body: JSON.stringify(record),
        });
        saved.push({ ksefNum, action: 'inserted' });
      }
    } catch (e) {
      errors.push({ ksefNum, err: e.message });
    }
  }

  return json({
    ok: true,
    fetched: invoiceHeaders.length,
    saved: saved.length,
    errors: errors.length > 0 ? errors : undefined,
    invoices: saved,
  });
}
