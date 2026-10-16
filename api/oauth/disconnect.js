import { cors, decrypt, json, serviceConfig, supabase, userFromRequest } from './_common.js';

export const config = { runtime: 'edge' };

// Odłącza konto: unieważnia refresh token u Google (best-effort) i usuwa zapis z bazy.
// Microsoft nie ma publicznego endpointu unieważnienia — usuwamy tylko nasz zapis.
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors());
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'Unauthorized' }, 401, cors());
    const query = new URL(req.url).searchParams;
    const provider = query.get('provider');
    if (!['google', 'microsoft'].includes(provider)) return json({ error: 'Invalid provider' }, 400, cors());
    serviceConfig();
    const uid = encodeURIComponent(user.id);
    if (provider === 'google' && query.get('feature') === 'mail') {
      // Wylogowanie z Gmaila: Kalendarz Google korzysta z tego samego połączenia, więc go nie kasujemy
      // ani nie unieważniamy — tylko wyłączamy pocztę (token odwołasz w ustawieniach konta Google).
      const off = await supabase(`oauth_connections?user_id=eq.${uid}&provider=eq.google&scopes=like.*gmail.*`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ mail_disabled: true }),
      });
      if (!off.ok) return json({ error: 'Could not disable mail (migration 0058 applied?)' }, 502, cors());
      return json({ ok: true }, 200, cors());
    }
    const r = await supabase(`oauth_connections?user_id=eq.${uid}&provider=eq.${provider}&select=id,refresh_token_ciphertext`);
    const rows = r.ok ? await r.json() : [];
    if (provider === 'google') {
      for (const row of rows) {
        try {
          const token = await decrypt(row.refresh_token_ciphertext);
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
          });
        } catch (_) { /* token mógł już wygasnąć — i tak usuwamy zapis */ }
      }
    }
    const del = await supabase(`oauth_connections?user_id=eq.${uid}&provider=eq.${provider}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
    if (!del.ok) return json({ error: 'Could not remove the connection' }, 502, cors());
    return json({ ok: true }, 200, cors());
  } catch (e) {
    return json({ error: e.message || 'Disconnect failed' }, 500, cors());
  }
}
