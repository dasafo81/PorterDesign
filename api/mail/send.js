// api/mail/send.js
// Vercel Edge Function — wysyła maile transakcyjne przez Resend.
// Wymagane zmienne środowiskowe (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY     — klucz API z resend.com (re_...)
//   MAIL_FROM          — adres nadawcy, np. "Porter Design <noreply@windowstudiopro.pl>"
//   SUPABASE_URL       — https://rkcidwusjzvfwxszotnb.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/mail/send
// Body: { template: string, to: string, data: object }
//
// Szablony:
//   welcome          — po rejestracji nowego tenanta
//   trial_expiring   — przypomnienie 3 dni przed końcem trialu
//   password_reset   — link do resetu hasła (generowany przez Supabase)
//
// Autoryzacja:
//   - "welcome" i "password_reset" mogą być wywołane z service_role (backend)
//     lub przez zalogowanego super-admina (tworzenie tenanta ręcznie)
//   - pozostałe wymagają zalogowanego usera (JWT w Authorization header)

export const config = { runtime: 'edge' };

const TEMPLATES = ['welcome', 'trial_expiring', 'password_reset'];

// Szablony wolne od wymogu JWT — wywoływane przez backend przy rejestracji
const PUBLIC_TEMPLATES = ['welcome', 'password_reset'];

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

// Weryfikuje JWT — zwraca user lub null
async function verifyJwt(req, SERVICE, SB_URL) {
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` },
  });
  if (!r.ok) return null;
  return r.json();
}

// ── Szablony HTML ────────────────────────────────────────────────────────────

function tplWelcome({ brand_name, email, login_url, trial_days }) {
  const name = brand_name || 'Twoje studio';
  const days = trial_days || 14;
  const url  = login_url || 'https://app.windowstudiopro.pl';
  return {
    subject: `Witaj w Window Studio Pro — ${name}`,
    html: `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#1a1a2e;padding:32px 40px;text-align:center">
    <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Window Studio Pro</span>
  </td></tr>
  <tr><td style="padding:40px">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e">Witaj, ${escHtml(name)}!</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6">
      Twoje konto jest aktywne. Masz <strong>${days} dni</strong> bezpłatnego dostępu do wszystkich funkcji.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#666">Twój adres e-mail do logowania:</p>
    <p style="margin:0 0 32px;font-size:15px;font-weight:600;color:#1a1a2e">${escHtml(email)}</p>
    <a href="${url}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">
      Przejdź do aplikacji →
    </a>
    <hr style="margin:40px 0;border:none;border-top:1px solid #eee">
    <p style="margin:0;font-size:13px;color:#999;line-height:1.5">
      Masz pytania? Napisz na <a href="mailto:hello@windowstudiopro.pl" style="color:#1a1a2e">hello@windowstudiopro.pl</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function tplTrialExpiring({ brand_name, trial_end_date, upgrade_url }) {
  const name = brand_name || 'Twoje studio';
  const date = trial_end_date || '';
  const url  = upgrade_url || 'https://app.windowstudiopro.pl/settings/billing';
  return {
    subject: `Twój trial wygasa ${date} — odnów dostęp`,
    html: `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#c0392b;padding:32px 40px;text-align:center">
    <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Window Studio Pro</span>
  </td></tr>
  <tr><td style="padding:40px">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e">Twój trial kończy się ${escHtml(date)}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6">
      Hej ${escHtml(name)}, za 3 dni wygasa Twój bezpłatny dostęp do Window Studio Pro.
      Aby zachować wszystkie dane i dalej korzystać z aplikacji, wybierz plan.
    </p>
    <a href="${url}" style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">
      Wybierz plan →
    </a>
    <hr style="margin:40px 0;border:none;border-top:1px solid #eee">
    <p style="margin:0;font-size:13px;color:#999">
      Pytania? <a href="mailto:hello@windowstudiopro.pl" style="color:#1a1a2e">hello@windowstudiopro.pl</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function tplPasswordReset({ reset_url }) {
  const url = reset_url || '#';
  return {
    subject: 'Reset hasła — Window Studio Pro',
    html: `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#1a1a2e;padding:32px 40px;text-align:center">
    <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Window Studio Pro</span>
  </td></tr>
  <tr><td style="padding:40px">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e">Reset hasła</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6">
      Otrzymaliśmy prośbę o reset hasła do Twojego konta. Kliknij przycisk poniżej.
      Link jest ważny przez <strong>24 godziny</strong>.
    </p>
    <a href="${url}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">
      Ustaw nowe hasło →
    </a>
    <hr style="margin:40px 0;border:none;border-top:1px solid #eee">
    <p style="margin:0;font-size:13px;color:#999;line-height:1.5">
      Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.<br>
      Pytania? <a href="mailto:hello@windowstudiopro.pl" style="color:#1a1a2e">hello@windowstudiopro.pl</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTemplate(template, data) {
  switch (template) {
    case 'welcome':        return tplWelcome(data || {});
    case 'trial_expiring': return tplTrialExpiring(data || {});
    case 'password_reset': return tplPasswordReset(data || {});
    default: return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const MAIL_FROM  = process.env.MAIL_FROM || 'Window Studio Pro <noreply@windowstudiopro.pl>';
  const SERVICE    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SB_URL     = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';

  if (!RESEND_KEY) return json({ error: 'RESEND_API_KEY not configured' }, 500);
  if (!SERVICE)    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }

  const template = (body && body.template) || '';
  const to       = (body && body.to) || '';
  const data     = (body && body.data) || {};

  if (!TEMPLATES.includes(template)) return json({ error: 'unknown template: ' + template }, 400);
  if (!to || !to.includes('@'))       return json({ error: 'invalid to address' }, 400);

  // Autoryzacja: public templates akceptują service_role key jako Bearer
  // (wywołanie z api/admin/* przy tworzeniu tenanta).
  // Pozostałe wymagają JWT zalogowanego usera.
  const authHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  // service_role key => wywołanie server-side (np. api/admin/users po stworzeniu tenanta)
  const isServiceCall = authHeader === SERVICE;

  if (!isServiceCall) {
    // Nie service_role — sprawdź czy to zalogowany user z JWT
    const user = await verifyJwt(req, SERVICE, SB_URL);
    if (!user) return json({ error: 'unauthorized' }, 401);
    // trial_expiring tylko dla admina
    if (template === 'trial_expiring') {
      const meta = user.app_metadata || {};
      if (!meta.is_super_admin && !meta.is_tenant_admin) {
        return json({ error: 'tenant-admin or super-admin required' }, 403);
      }
    }
  }

  const tpl = buildTemplate(template, data);
  if (!tpl) return json({ error: 'template build failed' }, 500);

  // Wyślij przez Resend
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: tpl.subject,
      html: tpl.html,
    }),
  });

  const resendData = await resendResp.json();

  if (!resendResp.ok) {
    console.error('Resend error:', resendData);
    return json({ error: 'mail delivery failed', detail: resendData }, 500);
  }

  return json({ ok: true, id: resendData.id });
}
