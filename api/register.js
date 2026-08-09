// api/register.js
// Publiczny endpoint rejestracji — tworzy tenanta + usera atomowo.
// NIE wymaga JWT (dostępny bez logowania).
// Zabezpieczenia: walidacja pól, sprawdzenie czy email już istnieje, honeypot.
//
// POST /api/register
// Body: { studio_name, email, phone, password, nip?, honeypot?, legal_consent }

export const config = { runtime: 'edge' };

const SB_URL     = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
const SERVICE    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TRIAL_DAYS = 3;
const LEGAL_VERSIONS = { terms: '1.0', privacy: '1.0', dpa: '1.0' };

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

function isValidNip(n) {
  if (!n) return true; // NIP opcjonalny
  const d = n.replace(/[\s\-]/g, '');
  if (!/^\d{10}$/.test(d)) return false;
  const w = [6,5,7,2,3,4,5,6,7];
  const sum = w.reduce((acc, ww, i) => acc + ww * parseInt(d[i]), 0);
  return (sum % 11) === parseInt(d[9]);
}

function trialEndsAt() {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.toISOString();
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!SERVICE) return json({ error: 'server misconfigured' }, 500);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }

  // Honeypot — boty wypełniają ukryte pole, ludzie nie
  if (body && body.honeypot) return json({ error: 'invalid request' }, 400);

  const studio_name = ((body && body.studio_name) || '').trim();
  const email       = ((body && body.email) || '').trim().toLowerCase();
  const phone       = ((body && body.phone) || '').trim();
  const password    = (body && body.password) || '';
  const nip         = ((body && body.nip) || '').replace(/[\s\-]/g, '');
  const legal_consent = body && body.legal_consent === true;

  // Walidacja
  if (!studio_name) return json({ error: 'Podaj nazwę studia.' }, 400);
  if (studio_name.length > 100) return json({ error: 'Nazwa studia jest za długa.' }, 400);
  if (!email || !isValidEmail(email)) return json({ error: 'Podaj poprawny adres e-mail.' }, 400);
  if (!phone || phone.length < 9) return json({ error: 'Podaj numer telefonu.' }, 400);
  if (!password || password.length < 8) return json({ error: 'Hasło musi mieć co najmniej 8 znaków.' }, 400);
  if (nip && !isValidNip(nip)) return json({ error: 'Podany NIP jest nieprawidłowy.' }, 400);
  if (!legal_consent) return json({ error: 'Wymagana jest akceptacja dokumentów prawnych.' }, 400);

  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  // Sprawdź czy email już istnieje
  const checkResp = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers });
  if (checkResp.ok) {
    const checkData = await checkResp.json();
    const exists = (checkData.users || []).some(u => u.email === email);
    if (exists) return json({ error: 'Konto z tym adresem e-mail już istnieje.' }, 409);
  }

  // 1. Utwórz tenanta
  const tenantResp = await fetch(`${SB_URL}/rest/v1/tenants`, {
    method: 'POST',
    headers: Object.assign({}, headers, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      name: studio_name,
      config: {
        brand_name: studio_name,
        phone: phone,
        nip: nip || null,
      },
      trial_ends_at: trialEndsAt(),
      legal_consents: {
        accepted_at: new Date().toISOString(),
        terms_version: LEGAL_VERSIONS.terms,
        privacy_version: LEGAL_VERSIONS.privacy,
        dpa_version: LEGAL_VERSIONS.dpa,
      },
    }),
  });

  if (!tenantResp.ok) {
    const detail = await tenantResp.text();
    console.error('tenant create failed:', detail);
    return json({ error: 'Błąd tworzenia konta. Spróbuj ponownie.' }, 500);
  }

  const tenantArr = await tenantResp.json();
  const tenant = Array.isArray(tenantArr) ? tenantArr[0] : tenantArr;
  if (!tenant || !tenant.id) return json({ error: 'Błąd tworzenia konta.' }, 500);

  // 2. Utwórz usera z email_confirm: false (Supabase wyśle mail weryfikacyjny)
  const userResp = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: false,  // wymaga potwierdzenia maila
      phone: phone || undefined,
      app_metadata: {
        tenant_id: tenant.id,
        is_tenant_admin: true,
        trial_ends_at: trialEndsAt(),
      },
      user_metadata: {
        studio_name,
        phone,
        nip: nip || null,
        legal_consents: {
          accepted_at: new Date().toISOString(),
          terms_version: LEGAL_VERSIONS.terms,
          privacy_version: LEGAL_VERSIONS.privacy,
          dpa_version: LEGAL_VERSIONS.dpa,
        },
      },
    }),
  });

  if (!userResp.ok) {
    const detail = await userResp.text();
    console.error('user create failed:', detail);
    // Rollback tenanta
    await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${tenant.id}`, {
      method: 'DELETE', headers,
    });
    return json({ error: 'Błąd tworzenia konta. Spróbuj ponownie.' }, 500);
  }

  // 3. Mail powitalny (best-effort — Supabase wyśle osobno mail weryfikacyjny)
  const origin = new URL(req.url).origin;
  fetch(`${origin}/api/mail/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'welcome',
      to: email,
      data: {
        brand_name: studio_name,
        email,
        trial_days: TRIAL_DAYS,
        login_url: origin,
      },
    }),
  }).catch(e => console.error('welcome mail failed:', e));

  return json({ ok: true, message: 'Konto zostało utworzone. Sprawdź e-mail i potwierdź adres.' });
}
