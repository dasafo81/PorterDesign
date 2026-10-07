// api/mcp.js
// Vercel Edge Function — zdalny serwer MCP (Streamable HTTP, bezstanowy, tylko odczyt).
// Pozwala Claude przeszukiwać klientów, wyceny i katalog Asystenta Dekoracji.
//
// Bezpieczeństwo: wszystkie zapytania do Supabase idą z tokenem ZALOGOWANEGO
// użytkownika (nie service role), więc RLS po tenant_id izoluje dane tenantów.
// Zapis jest niedostępny. Ceny zakupu, marże i koszty zleceń są domyślnie ukryte
// (włącza je MCP_EXPOSE_PURCHASE_PRICES=1).
//
// Autoryzacja: Bearer = access_token Supabase. Metadane OAuth (RFC 9728) wskazują
// Supabase Auth jako serwer autoryzacji (wymaga włączonego OAuth server w Supabase).

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const EXPOSE_PURCHASE = process.env.MCP_EXPOSE_PURCHASE_PRICES === '1';
const MAX_LIMIT = 25;
const PROTOCOL = '2025-06-18';

const WINDOW_MS = 60 * 1000;
const MAX_REQ = 60;
const buckets = new Map();

function rateLimited(key) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.t >= WINDOW_MS) { buckets.set(key, { t: now, n: 1 }); return false; }
  b.n += 1;
  return b.n > MAX_REQ;
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(), ...extra },
  });
}

function origin(req) { return new URL(req.url).origin; }

// ── REST do Supabase z tokenem użytkownika ─────────────────────────────────
async function sb(token, path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

async function userFromToken(token) {
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

// Usuwa znaki specjalne PostgREST/ilike z frazy użytkownika.
function term(s) {
  return String(s || '').replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function lim(n) { return Math.min(Math.max(parseInt(n, 10) || 10, 1), MAX_LIMIT); }
function isoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null; }
function isId(s) { return /^\d+$/.test(String(s)); }

const CLIENT_COLS = 'id,name,addr,postal,city,phone,email,status,quote_no,contact_id,created_at,updated_at';
const OFFER_COLS = 'id,client_id,number,kind,total_gross,discount_amount,valid_until,status,notes,created_at';
const INVOICE_COLS = 'id,number,direction,doc_type,status,issue_date,sale_date,due_date,payment_method,payment_status,paid_amount,buyer_name,buyer_nip,buyer_city,buyer_email,seller_snapshot,client_id,deal_id,contact_id,offer_number,total_net,total_vat,total_gross,currency,notes,ksef_status,ksef_number,created_at';
const ITEM_COLS = 'position,name,quantity,unit,unit_net,vat_rate,line_net,line_vat,line_gross';
const CONTACT_COLS = 'id,kind,role,name,nip,regon,street,postal,city,email,phone,default_payment_days,tags,notes,created_at';
const WAREHOUSE_COLS = 'id,category,name,quantity,unit,color,supplier,location,notes,length_cm,updated_at';
const COST_COLS = 'id,deal_id,kind,amount,supplier,installer_name,paid_at,planned_delivery,actual_delivery,note';
const MAX_TEXT = 40000; // limit odpowiedzi get_client_quote (znaki)
const CATALOG_BASE = 'id,name,price,unit,meta,height_cm,composition,weight_gsm,shrinkage_pct,flame_retardant,soundproof,hidden';

// ── Narzędzia ──────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'search_clients',
    description: 'Szukaj klientów (wycen) po imieniu/nazwisku, telefonie, e-mailu, mieście lub numerze wyceny. Zwraca max 25 wyników bez pomieszczeń i okien.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Fraza do wyszukania' },
      status: { type: 'string', description: 'Opcjonalny status klienta' },
      limit: { type: 'integer', description: 'Max wyników (1-25, domyślnie 10)' },
    } },
  },
  {
    name: 'get_client',
    description: 'Szczegóły jednego klienta (po id) wraz z listą jego ofert.',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'search_offers',
    description: 'Szukaj wygenerowanych ofert/wycen po numerze, kliencie, statusie i zakresie dat utworzenia (RRRR-MM-DD).',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Fragment numeru oferty, np. nazwisko' },
      client_id: { type: 'integer' },
      status: { type: 'string' },
      date_from: { type: 'string' },
      date_to: { type: 'string' },
      limit: { type: 'integer' },
    } },
  },
  {
    name: 'search_catalog',
    description: 'Szukaj w katalogu produktów (tkaniny, tapety, inne) po nazwie, producencie lub składzie. Zwraca cenę sprzedaży, jednostkę, szerokość, skład, gramaturę.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Nazwa, producent lub skład' },
      flame_retardant: { type: 'boolean', description: 'Tylko trudnopalne' },
      soundproof: { type: 'boolean', description: 'Tylko dźwiękoszczelne' },
      limit: { type: 'integer' },
    } },
  },
  {
    name: 'get_client_quote',
    description: 'Treść wyceny klienta: pomieszczenia, okna i produkty (typ, konfiguracja, ręcznie ustawiona cena). Ceny wyliczane przez aplikację nie są zapisane w bazie — łączną kwotę wygenerowanej oferty podają search_offers / get_client.',
    inputSchema: { type: 'object', properties: { client_id: { type: 'integer' } }, required: ['client_id'] },
  },
  {
    name: 'search_invoices',
    description: 'Szukaj faktur (sprzedaży i zakupu) po numerze, nabywcy/NIP, typie, statusie, statusie płatności, dacie wystawienia, kliencie lub zleceniu (deal). Zwraca nagłówki bez XML.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Numer faktury, nazwa nabywcy lub NIP' },
      direction: { type: 'string', description: 'sprzedaz lub zakup' },
      doc_type: { type: 'string', description: 'vat | proforma | zaliczka | koncowa | korekta | uproszczona' },
      status: { type: 'string', description: 'draft | issued | sent | cancelled' },
      payment_status: { type: 'string', description: 'unpaid | partial | paid' },
      client_id: { type: 'integer' },
      deal_id: { type: 'string', description: 'UUID zlecenia' },
      date_from: { type: 'string', description: 'Data wystawienia od, RRRR-MM-DD' },
      date_to: { type: 'string', description: 'Data wystawienia do, RRRR-MM-DD' },
      limit: { type: 'integer' },
    } },
  },
  {
    name: 'get_invoice',
    description: 'Jedna faktura (po UUID) wraz z pozycjami.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'search_contacts',
    description: 'Szukaj kontrahentów (klienci i dostawcy) po nazwie, NIP, e-mailu, telefonie lub mieście.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string' },
      role: { type: 'string', description: 'klient | dostawca | oba' },
      limit: { type: 'integer' },
    } },
  },
  {
    name: 'search_deals',
    description: 'Szukaj zleceń w CRM (etap, terminy wizyt/dostawy, notatki, stan zamówień) po etapie, kliencie lub zakresie terminu.',
    inputSchema: { type: 'object', properties: {
      stage: { type: 'string', description: 'Etap, np. pomiar, zaliczka, zamowienie' },
      client_id: { type: 'integer' },
      deadline_from: { type: 'string' },
      deadline_to: { type: 'string' },
      limit: { type: 'integer' },
    } },
  },
  {
    name: 'get_deal',
    description: 'Jedno zlecenie z CRM (po UUID), jego faktury' + (EXPOSE_PURCHASE ? ' i koszty.' : '. Koszty zlecenia są wyłączone w konfiguracji serwera.'),
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'search_warehouse',
    description: 'Szukaj w magazynie (tkaniny, mechanizmy, gotowe, próbniki, szyny) po nazwie, kolorze, dostawcy, lokalizacji lub kategorii.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string' },
      category: { type: 'string', description: 'tkanina | mechanizm | gotowy | probnik | szyna' },
      limit: { type: 'integer' },
    } },
  },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM = /^[a-z_0-9ąćęłńóśźż-]{1,40}$/i;
function enumVal(v, label) { if (!ENUM.test(String(v))) throw new Error('Nieprawidłowa wartość: ' + label); return encodeURIComponent(v); }

// Ogranicza ciężki JSON wyceny: usuwa zdjęcia/base64 i bardzo długie teksty.
function slim(v) {
  if (Array.isArray(v)) return v.map(slim);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (/^(img|image|photo|foto|preview|thumb)/i.test(k)) continue;
      o[k] = slim(v[k]);
    }
    return o;
  }
  if (typeof v === 'string' && v.length > 300) return v.slice(0, 300) + '…';
  return v;
}

function sellerBrief(snap) {
  if (!snap || typeof snap !== 'object') return undefined;
  const o = {};
  for (const k of Object.keys(snap)) if (/name|nazwa|nip/i.test(k)) o[k] = snap[k];
  return o;
}

async function callTool(name, a, token) {
  a = a || {};
  if (name === 'search_clients') {
    const q = term(a.query);
    let p = `clients?select=${CLIENT_COLS}&deleted_at=is.null&order=id.desc&limit=${lim(a.limit)}`;
    if (q) p += `&or=(name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*,city.ilike.*${q}*,quote_no.ilike.*${q}*)`;
    if (a.status) p += `&status=eq.${encodeURIComponent(term(a.status))}`;
    return sb(token, p);
  }
  if (name === 'get_client') {
    if (!isId(a.id)) throw new Error('Nieprawidłowe id');
    const [rows, offers] = await Promise.all([
      sb(token, `clients?select=${CLIENT_COLS}&id=eq.${a.id}&deleted_at=is.null`),
      sb(token, `offers?select=${OFFER_COLS}&client_id=eq.${a.id}&order=created_at.desc&limit=${MAX_LIMIT}`),
    ]);
    if (!rows.length) throw new Error('Nie znaleziono klienta');
    return { client: rows[0], offers };
  }
  if (name === 'search_offers') {
    let p = `offers?select=${OFFER_COLS}&order=created_at.desc&limit=${lim(a.limit)}`;
    const q = term(a.query);
    if (q) p += `&number=ilike.*${q}*`;
    if (a.client_id != null) { if (!isId(a.client_id)) throw new Error('Nieprawidłowe client_id'); p += `&client_id=eq.${a.client_id}`; }
    if (a.status) p += `&status=eq.${encodeURIComponent(term(a.status))}`;
    const from = isoDate(a.date_from), to = isoDate(a.date_to);
    if (from) p += `&created_at=gte.${from}`;
    if (to) p += `&created_at=lte.${to}T23:59:59`;
    return sb(token, p);
  }
  if (name === 'search_catalog') {
    const cols = CATALOG_BASE + (EXPOSE_PURCHASE ? ',purchase_price,belka_price' : '');
    let p = `catalog_items?select=${cols}&hidden=eq.false&order=name.asc&limit=${lim(a.limit)}`;
    const q = term(a.query);
    if (q) p += `&or=(name.ilike.*${q}*,meta.ilike.*${q}*,composition.ilike.*${q}*)`;
    if (a.flame_retardant === true) p += '&flame_retardant=eq.true';
    if (a.soundproof === true) p += '&soundproof=eq.true';
    return sb(token, p);
  }
  if (name === 'get_client_quote') {
    if (!isId(a.client_id)) throw new Error('Nieprawidłowe client_id');
    const rows = await sb(token, `clients?select=id,name,quote_no,status,rooms&id=eq.${a.client_id}&deleted_at=is.null`);
    if (!rows.length) throw new Error('Nie znaleziono klienta');
    const c = rows[0];
    const out = JSON.stringify({ id: c.id, name: c.name, quote_no: c.quote_no, status: c.status, rooms: slim(c.rooms || []) });
    return out.length > MAX_TEXT ? { truncated: true, note: 'Wycena jest bardzo duża — pokazano początek.', json: out.slice(0, MAX_TEXT) } : JSON.parse(out);
  }
  if (name === 'search_invoices') {
    let p = `invoices?select=${INVOICE_COLS}&order=created_at.desc&limit=${lim(a.limit)}`;
    const q = term(a.query);
    if (q) p += `&or=(number.ilike.*${q}*,buyer_name.ilike.*${q}*,buyer_nip.ilike.*${q}*)`;
    if (a.direction) p += `&direction=eq.${enumVal(a.direction, 'direction')}`;
    if (a.doc_type) p += `&doc_type=eq.${enumVal(a.doc_type, 'doc_type')}`;
    if (a.status) p += `&status=eq.${enumVal(a.status, 'status')}`;
    if (a.payment_status) p += `&payment_status=eq.${enumVal(a.payment_status, 'payment_status')}`;
    if (a.client_id != null) { if (!isId(a.client_id)) throw new Error('Nieprawidłowe client_id'); p += `&client_id=eq.${a.client_id}`; }
    if (a.deal_id) { if (!UUID.test(a.deal_id)) throw new Error('Nieprawidłowe deal_id'); p += `&deal_id=eq.${a.deal_id}`; }
    const from = isoDate(a.date_from), to = isoDate(a.date_to);
    if (from) p += `&issue_date=gte.${from}`;
    if (to) p += `&issue_date=lte.${to}`;
    const rows = await sb(token, p);
    return rows.map((r) => ({ ...r, seller_snapshot: sellerBrief(r.seller_snapshot) }));
  }
  if (name === 'get_invoice') {
    if (!UUID.test(String(a.id))) throw new Error('Nieprawidłowe id');
    const [rows, items] = await Promise.all([
      sb(token, `invoices?select=${INVOICE_COLS}&id=eq.${a.id}`),
      sb(token, `invoice_items?select=${ITEM_COLS}&invoice_id=eq.${a.id}&order=position.asc`),
    ]);
    if (!rows.length) throw new Error('Nie znaleziono faktury');
    return { invoice: { ...rows[0], seller_snapshot: sellerBrief(rows[0].seller_snapshot) }, items };
  }
  if (name === 'search_contacts') {
    let p = `contacts?select=${CONTACT_COLS}&order=name.asc&limit=${lim(a.limit)}`;
    const q = term(a.query);
    if (q) p += `&or=(name.ilike.*${q}*,nip.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*,city.ilike.*${q}*)`;
    if (a.role) p += `&role=eq.${enumVal(a.role, 'role')}`;
    return sb(token, p);
  }
  if (name === 'search_deals') {
    let p = `deals?select=*&order=created_at.desc&limit=${lim(a.limit)}`;
    if (a.stage) p += `&stage=eq.${enumVal(a.stage, 'stage')}`;
    if (a.client_id != null) { if (!isId(a.client_id)) throw new Error('Nieprawidłowe client_id'); p += `&client_id=eq.${a.client_id}`; }
    const from = isoDate(a.deadline_from), to = isoDate(a.deadline_to);
    if (from) p += `&deadline=gte.${from}`;
    if (to) p += `&deadline=lte.${to}`;
    return sb(token, p);
  }
  if (name === 'get_deal') {
    if (!UUID.test(String(a.id))) throw new Error('Nieprawidłowe id');
    const jobs = [
      sb(token, `deals?select=*&id=eq.${a.id}`),
      sb(token, `invoices?select=id,number,direction,doc_type,status,payment_status,total_gross,issue_date&deal_id=eq.${a.id}&order=created_at.desc&limit=${MAX_LIMIT}`),
    ];
    if (EXPOSE_PURCHASE) jobs.push(sb(token, `deal_costs?select=${COST_COLS}&deal_id=eq.${a.id}&order=created_at.asc`));
    const [rows, invoices, costs] = await Promise.all(jobs);
    if (!rows.length) throw new Error('Nie znaleziono zlecenia');
    return EXPOSE_PURCHASE ? { deal: rows[0], invoices, costs } : { deal: rows[0], invoices };
  }
  if (name === 'search_warehouse') {
    let p = `warehouse_items?select=${WAREHOUSE_COLS}&order=name.asc&limit=${lim(a.limit)}`;
    const q = term(a.query);
    if (q) p += `&or=(name.ilike.*${q}*,color.ilike.*${q}*,supplier.ilike.*${q}*,location.ilike.*${q}*)`;
    if (a.category) p += `&category=eq.${enumVal(a.category, 'category')}`;
    return sb(token, p);
  }
  throw new Error('Nieznane narzędzie');
}

// ── JSON-RPC ───────────────────────────────────────────────────────────────
async function handleRpc(msg, token) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (method === 'initialize') {
    return ok({
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: 'asystent-dekoracji', version: '1.1.0' },
      instructions: 'Dostęp tylko do odczytu: klienci, wyceny, oferty, faktury, kontrahenci, zlecenia CRM, magazyn i katalog produktów zalogowanego użytkownika.',
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const data = await callTool(params?.name, params?.arguments, token);
      return ok({ content: [{ type: 'text', text: JSON.stringify(data) }] });
    } catch (e) {
      return ok({ isError: true, content: [{ type: 'text', text: String(e.message || 'Błąd') }] });
    }
  }
  if (id === undefined) return null; // notyfikacja (np. notifications/initialized)
  return err(-32601, 'Method not found');
}

export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  // RFC 9728 — metadane chronionego zasobu (rewrite w vercel.json)
  if (url.searchParams.has('metadata') || url.pathname.includes('oauth-protected-resource')) {
    return json({
      resource: `${origin(req)}/api/mcp`,
      authorization_servers: [`${SB_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
    });
  }

  if (!SB_ANON) return json({ error: 'SUPABASE_ANON_KEY is not configured' }, 500);

  const challenge = {
    'WWW-Authenticate': `Bearer resource_metadata="${origin(req)}/api/mcp?metadata=1"`,
  };
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) return json({ error: 'unauthorized' }, 401, challenge);
  const token = m[1];

  if (req.method === 'GET') return new Response(null, { status: 405, headers: { ...cors(), Allow: 'POST' } });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const user = await userFromToken(token);
  if (!user) return json({ error: 'unauthorized' }, 401, challenge);
  if (rateLimited(user.id)) return json({ error: 'rate limited' }, 429, { 'Retry-After': '60' });

  let body;
  try { body = JSON.parse(await req.text()); } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 20).map((b) => handleRpc(b, token)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors() });
  }
  const res = await handleRpc(body, token);
  return res ? json(res) : new Response(null, { status: 202, headers: cors() });
}
