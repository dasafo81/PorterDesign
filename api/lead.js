// api/lead.js
// Publiczny endpoint dla formularza "Umów demo" na landing.html.
// NIE wymaga JWT (dostępny bez logowania) — analogicznie do api/register.js.
// Zabezpieczenia: walidacja pól, honeypot.
// Wysyła powiadomienie mailowe przez Resend na adres z env LEAD_TO_EMAIL.
//
// Wymagane zmienne środowiskowe (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  — już skonfigurowany dla api/mail/send.js
//   MAIL_FROM       — już skonfigurowany dla api/mail/send.js
//   LEAD_TO_EMAIL   — adres, na który mają trafiać leady (np. "paulina@asystentdekoracji.pl")
//
// POST /api/lead
// Body: { name, email, studio, city, message?, honeypot? }

export const config = { runtime: 'edge' };

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
  });
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const MAIL_FROM  = process.env.MAIL_FROM || 'Asystent Dekoracji <noreply@asystentdekoracji.pl>';
  const LEAD_TO    = process.env.LEAD_TO_EMAIL;

  if (!RESEND_KEY) return json({ error: 'server misconfigured' }, 500);
  if (!LEAD_TO)    return json({ error: 'server misconfigured' }, 500);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }

  // Honeypot — boty wypełniają ukryte pole, ludzie nie
  if (body && body.honeypot) return json({ error: 'invalid request' }, 400);

  const name    = ((body && body.name) || '').trim();
  const email   = ((body && body.email) || '').trim().toLowerCase();
  const studio  = ((body && body.studio) || '').trim();
  const city    = ((body && body.city) || '').trim();
  const message = ((body && body.message) || '').trim();

  if (!name) return json({ error: 'Podaj imię i nazwisko.' }, 400);
  if (!email || !isValidEmail(email)) return json({ error: 'Podaj poprawny adres e-mail.' }, 400);

  const html = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#1a1a2e;padding:24px 32px">
    <span style="color:#fff;font-size:18px;font-weight:700">Nowe zgłoszenie z landing page</span>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 10px;font-size:14px;color:#444"><strong>Imię i nazwisko:</strong> ${escHtml(name)}</p>
    <p style="margin:0 0 10px;font-size:14px;color:#444"><strong>E-mail:</strong> ${escHtml(email)}</p>
    <p style="margin:0 0 10px;font-size:14px;color:#444"><strong>Studio:</strong> ${escHtml(studio) || '—'}</p>
    <p style="margin:0 0 10px;font-size:14px;color:#444"><strong>Miasto:</strong> ${escHtml(city) || '—'}</p>
    <p style="margin:16px 0 0;font-size:14px;color:#444;line-height:1.6"><strong>Wiadomość:</strong><br>${escHtml(message) || '(brak)'}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [LEAD_TO],
      reply_to: email,
      subject: `Nowy lead: ${name}${studio ? ' — ' + studio : ''}`,
      html,
    }),
  });

  if (!resendResp.ok) {
    const detail = await resendResp.text();
    console.error('Resend error (lead):', detail);
    return json({ error: 'Błąd wysyłki. Spróbuj ponownie.' }, 500);
  }

  return json({ ok: true });
}
