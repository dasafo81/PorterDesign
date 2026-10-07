// api/mcp.js
// Vercel Edge Function — zdalny serwer MCP (Streamable HTTP, bezstanowy, tylko odczyt).
// Pozwala Claude przeszukiwać klientów, wyceny i katalog Asystenta Dekoracji.
//
// Bezpieczeństwo: wszystkie zapytania do Supabase idą z tokenem ZALOGOWANEGO
// użytkownika (nie service role), więc RLS po tenant_id izoluje dane tenantów.
// Zapis jest niedostępny. Ceny zakupu/marże są domyślnie ukryte
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
];

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
      serverInfo: { name: 'asystent-dekoracji', version: '1.0.0' },
      instructions: 'Dostęp tylko do odczytu: klienci, oferty i katalog produktów zalogowanego użytkownika.',
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
