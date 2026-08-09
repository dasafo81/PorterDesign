export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'GET only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const checks = { app: true, supabase: false };

  if (key) {
    try {
      const response = await fetch(`${url}/rest/v1/clients?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      checks.supabase = response.ok;
    } catch (_) {
      checks.supabase = false;
    }
  }

  const ok = checks.app && checks.supabase;
  return new Response(JSON.stringify({ ok, checks, time: new Date().toISOString() }), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
