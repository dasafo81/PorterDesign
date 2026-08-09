// api/stripe/webhook.js
// Odbiera zdarzenia Stripe i aktualizuje status subskrypcji tenanta w Supabase.
// Weryfikacja podpisu ręcznie przez Web Crypto (Edge runtime nie ma Node 'crypto',
// a dociąganie stripe-node do Edge Function jest niepotrzebnym obciążeniem).
//
// Wymagane zmienne środowiskowe (Vercel → Settings → Environment Variables):
//   STRIPE_WEBHOOK_SECRET — whsec_... (z Stripe Dashboard → Webhooks → dany endpoint)
//   STRIPE_PRICE_START / STRIPE_PRICE_STUDIO / STRIPE_PRICE_PRO — do mapowania price → plan
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — już skonfigurowane
//   Migration 0024_stripe_webhook_events.sql must be applied before enabling live webhooks.
//
// Skonfiguruj w Stripe Dashboard:
//   Endpoint URL: https://asystentdekoracji.pl/api/stripe/webhook
//   Zdarzenia: checkout.session.completed, customer.subscription.updated,
//              customer.subscription.deleted, invoice.payment_failed

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL || 'https://rkcidwusjzvfwxszotnb.supabase.co';
const SIGNATURE_TOLERANCE_SECONDS = 300;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function planForPrice(priceId) {
  if (priceId === process.env.STRIPE_PRICE_START)  return 'start';
  if (priceId === process.env.STRIPE_PRICE_STUDIO) return 'studio';
  if (priceId === process.env.STRIPE_PRICE_PRO)    return 'pro';
  return null;
}

// Mapuje status Stripe na nasz uproszczony subscription_status
function mapStatus(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid')  return 'past_due';
  if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') return 'canceled';
  return 'incomplete';
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Weryfikuje nagłówek Stripe-Signature: "t=169...,v1=abcd...,v1=..." (Stripe może wysłać kilka v1)
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map(kv => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; })
  );
  const t = parts.t;
  const timestamp = Number(t);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const v1candidates = sigHeader.split(',').filter(kv => kv.startsWith('v1=')).map(kv => kv.slice(3));
  if (!t || v1candidates.length === 0) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1candidates.includes(expected);
}

async function claimEvent(eventId, eventType, headers) {
  const r = await fetch(`${SB_URL}/rest/v1/stripe_webhook_events`, {
    method: 'POST',
    headers: Object.assign({}, headers, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ id: eventId, event_type: eventType }),
  });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error(`webhook event claim failed (${r.status}): ${await r.text()}`);
  return true;
}

async function updateTenantByCustomer(customerId, patch, headers) {
  const r = await fetch(`${SB_URL}/rest/v1/tenants?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH', headers, body: JSON.stringify(patch),
  });
  if (!r.ok) console.error('tenant update by customer failed:', await r.text());
}

async function updateTenantById(tenantId, patch, headers) {
  const r = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
    method: 'PATCH', headers, body: JSON.stringify(patch),
  });
  if (!r.ok) console.error('tenant update by id failed:', await r.text());
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!WEBHOOK_SECRET || !SERVICE) return json({ error: 'server misconfigured' }, 500);

  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';
  const validSig = await verifyStripeSignature(rawBody, sigHeader, WEBHOOK_SECRET);
  if (!validSig) return json({ error: 'invalid signature' }, 400);

  let event;
  try { event = JSON.parse(rawBody); } catch (e) { return json({ error: 'invalid json' }, 400); }
  if (!event.id || !event.type) return json({ error: 'invalid event' }, 400);

  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  try {
    if (!(await claimEvent(event.id, event.type, headers))) return json({ received: true, duplicate: true });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.client_reference_id || (session.metadata && session.metadata.tenant_id);
        const plan = (session.metadata && session.metadata.plan) || null;
        if (tenantId) {
          await updateTenantById(tenantId, {
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            subscription_status: 'active',
            plan: plan,
          }, headers);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const tenantId = sub.metadata && sub.metadata.tenant_id;
        const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
        const plan = planForPrice(priceId);
        const patch = { subscription_status: mapStatus(sub.status) };
        if (plan) patch.plan = plan;
        if (tenantId) await updateTenantById(tenantId, patch, headers);
        else await updateTenantByCustomer(sub.customer, patch, headers);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const tenantId = sub.metadata && sub.metadata.tenant_id;
        const patch = { subscription_status: 'canceled' };
        if (tenantId) await updateTenantById(tenantId, patch, headers);
        else await updateTenantByCustomer(sub.customer, patch, headers);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.customer) {
          await updateTenantByCustomer(invoice.customer, { subscription_status: 'past_due' }, headers);
        }
        break;
      }

      default:
        // Inne zdarzenia ignorujemy — Stripe i tak wymaga 200, żeby nie retry'ować w nieskończoność
        break;
    }
  } catch (e) {
    console.error('webhook handler error:', e);
    return json({ error: 'webhook processing failed' }, 500);
  }

  return json({ received: true });
}
