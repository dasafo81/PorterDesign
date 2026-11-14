// api/montaz.js
// Publiczny, tylko do odczytu widok „Do montażu” dla montażysty — link wstawiany do opisu
// wydarzenia w Google Calendar (https://…/m/<token>, przepisywane na /api/montaz?t=<token>).
// NIE wymaga logowania: dostęp daje wyłącznie nieodgadywalny token (64 znaki hex) z tabeli
// montaz_shares (migracja 0075). Snapshot zawiera tylko to, co potrzebne na montażu —
// bez cen, bez danych kontaktowych klienta poza nazwą i adresem.
//
// GET /api/montaz?t=<token>
//
// Wymaga: SUPABASE_SERVICE_ROLE_KEY (już skonfigurowany), SUPABASE_URL (opcjonalnie).

import { renderMontazHtml } from './_montazView.js';

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

function page(html, status, nonce) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  };
  // Treść jest ucieczkowana po stronie serwera; CSP dodatkowo blokuje wszystko poza inline-stylem
  // i jednym skryptem z nonce (przycisk Drukuj).
  headers['Content-Security-Policy'] = nonce
    ? `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    : "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  return new Response(html, { status, headers });
}

function msg(text, status) {
  return page(
    '<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>Do montażu</title></head>'
    + '<body style="font-family:Arial,sans-serif;color:#555;text-align:center;padding:60px 20px">' + text + '</body></html>',
    status
  );
}

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return msg('Niedozwolona metoda.', 405);

  const token = (new URL(req.url).searchParams.get('t') || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return msg('Nieprawidłowy link.', 404);

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return msg('Usługa jest chwilowo niedostępna.', 500);

  let rows;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/montaz_shares?token=eq.${token}&select=payload,updated_at&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    if (!r.ok) {
      console.error('montaz_shares lookup failed', r.status);
      return msg('Usługa jest chwilowo niedostępna.', 502);
    }
    rows = await r.json();
  } catch (e) {
    console.error('montaz_shares lookup error', e);
    return msg('Usługa jest chwilowo niedostępna.', 502);
  }
  if (!rows || !rows.length) return msg('Ten link jest nieaktualny albo nie istnieje.', 404);

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const data = Object.assign({}, rows[0].payload || {}, { updatedAt: rows[0].updated_at });
  return page(renderMontazHtml(data, { nonce }), 200, nonce);
}
