// api/stripe/checkout.js
// Tworzy Stripe Checkout Session dla zalogowanego tenant-admina.
// Wymaga JWT (Authorization: Bearer <user token>).
//
// Wymagane zmienne środowiskowe (Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY   — sk_test_... lub sk_live_...
//   STRIPE_PRICE_START  — price_... (plan Start, 149 zł/mc)
//   STRIPE_PRICE_STUDIO — price_... (plan Studio, 279 zł/mc)
//   STRIPE_PRICE_PRO    — price_... (plan Pro, 449 zł/mc)
//   APP_URL             — np. https://asystentdekoracji.pl (do success/cancel URL)
//
// POST /api/stripe/checkout
// Body: { plan: "start" | "studio" | "pro" }
// → { url } — redirect na Stripe Checkout

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

function priceForPlan(plan) {
  if (plan === 'start')  return process.env.STRIPE_PRICE_START;
  if (plan === 'studio') return process.env.STRIPE_PRICE_STUDIO;
  if (plan === 'pro')    return process.env.STRIPE_PRICE_PRO;
  return null;
}

// Weryfikuje JWT — zwraca user (z tenant_id) lub null
async function verifyUser(req) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!SERVICE || !auth) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${auth}` },
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const APP_URL    = process.env.APP_URL || 'https://asystentdekoracji.pl';
  if (!STRIPE_KEY) return json({ error: 'server misconfigured' }, 500);

  const user = await verifyUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const meta = user.app_metadata || {};
  const tenantId = meta.tenant_id;
  if (!tenantId) return json({ error: 'no tenant_id' }, 403);
  if (!meta.is_tenant_admin && !meta.is_super_admin) {
    return json({ error: 'tenant-admin required' }, 403);
  }

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
  const plan = (body && body.plan) || '';
  const priceId = priceForPlan(plan);
  if (!priceId) return json({ error: 'nieznany plan: ' + plan }, 400);

  // Stripe Checkout Session — subscription mode, PLN, BLIK + karta + Przelewy24
  // (metody płatności aktywowane w Stripe Dashboard → Settings → Payment methods)
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', tenantId);
  params.set('metadata[tenant_id]', tenantId);
  params.set('metadata[plan]', plan);
  params.set('subscription_data[metadata][tenant_id]', tenantId);
  params.set('subscription_data[metadata][plan]', plan);
  params.set('success_url', `${APP_URL}/?checkout=success`);
  params.set('cancel_url', `${APP_URL}/?checkout=cancelled`);
  if (user.email) params.set('customer_email', user.email);

  const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await stripeResp.json();
  if (!stripeResp.ok) {
    console.error('Stripe checkout error:', session);
    return json({ error: 'Błąd tworzenia sesji płatności.' }, 500);
  }

  return json({ url: session.url });
}
