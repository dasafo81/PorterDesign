export const config = { runtime: 'edge' };

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_BODY_BYTES = 256 * 1024;
const buckets = new Map();

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function corsHeaders(req) {
  const origin = req.headers.get('origin');
  const allowed = process.env.APP_ORIGIN || 'https://www.asystentdekoracji.pl';
  return origin === allowed ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  } : {};
}

function clientKey(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

function isRateLimited(key) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

async function requireUser(req) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const token = authorization.replace(/^Bearer\s+/i, '');
  const supabaseUrl = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseKey) throw new Error('SUPABASE_ANON_KEY is not configured');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
  });
  return response.ok ? response.json() : null;
}

export default async function handler(req) {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: { message: 'Method not allowed' } }, 405, cors);
  }
  if (Object.keys(cors).length === 0 && req.headers.get('origin')) {
    return json({ error: { message: 'Origin not allowed' } }, 403);
  }
  if (isRateLimited(clientKey(req))) {
    return json({ error: { message: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.' } }, 429, {
      ...cors, 'Retry-After': '60',
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: { message: 'Usługa AI nie jest skonfigurowana.' } }, 500, cors);
  }

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: { message: 'Wymagane jest zalogowanie.' } }, 401, cors);

    const body = await req.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return json({ error: { message: 'Żądanie jest zbyt duże.' } }, 413, cors);
    }
    let payload;
    try { payload = JSON.parse(body); } catch {
      return json({ error: { message: 'Nieprawidłowy JSON.' } }, 400, cors);
    }
    if (!payload || !Array.isArray(payload.messages) || payload.messages.length < 1 ||
        payload.messages.length > 40 || typeof payload.system !== 'string' ||
        payload.system.length > 50000) {
      return json({ error: { message: 'Nieprawidłowy format żądania.' } }, 400, cors);
    }
    const messages = payload.messages.every((message) =>
      message && (message.role === 'user' || message.role === 'assistant') &&
      (typeof message.content === 'string' ||
        (Array.isArray(message.content) && message.content.length <= 10))
    );
    if (!messages) return json({ error: { message: 'Nieprawidłowa historia rozmowy.' } }, 400, cors);
    const safePayload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: Math.min(Math.max(Number(payload.max_tokens) || 3000, 1), 4000),
      system: payload.system,
      messages: payload.messages,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(safePayload),
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...cors,
      },
    });
  } catch (err) {
    console.error('Claude proxy error', err);
    return json({ error: { message: 'Wewnętrzny błąd usługi AI.' } }, 500, cors);
  }
}
