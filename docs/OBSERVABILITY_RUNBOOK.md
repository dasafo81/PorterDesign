# Observability and incident response

## What is monitored automatically

The `Backup and production monitor` workflow runs every 15 minutes. It checks:

- `/api/health` returns `200` and reports both `app:true` and `supabase:true`;
- the public landing page is reachable;
- Stripe webhook rejects an unsigned request (`400`);
- Checkout and KSeF reject unauthenticated requests (`401`).

These synthetic checks never create a Stripe session, charge a card, or submit an
invoice to KSeF. A failed check makes the GitHub Actions workflow red and should
be treated as a production incident until investigated.

## Severity and response

| Severity | Example | First response | Target |
|---|---|---|---|
| SEV-1 | checkout unavailable, cross-tenant access, payment state corruption | stop self-service sales; inspect latest deployment and Vercel logs; rollback if needed | 30 min |
| SEV-2 | KSeF send/status errors, webhook retries, elevated API 5xx | inspect correlation/request logs and provider status; retry only after cause is known | 4 h |
| SEV-3 | landing page, non-critical mail, isolated user error | record issue and schedule a fix; do not retry blindly | 1 business day |

## Provider-specific first checks

### Application

1. Open the failed GitHub Actions run and identify the first failing synthetic.
2. Check the Vercel deployment status and function logs for the same timestamp.
3. Compare against the last known-good deployment; rollback only if the failure
   is confirmed as a release regression.

### Stripe

1. Check Stripe Dashboard → Developers → Webhooks for delivery failures and
   retry state.
2. Confirm `STRIPE_WEBHOOK_SECRET` and the three `STRIPE_PRICE_*` variables are
   present in Production; never paste their values into Slack or a ticket.
3. Verify `stripe_webhook_events` has the event ID and that tenant updates
   succeeded. A `5xx` response is required for Stripe to retry.
4. Do not use a real card for a smoke test without explicit approval.

### KSeF

1. Check the invoice's `ksef_status` and `ksef_error`; preserve the returned
   provider detail for diagnosis.
2. Check KSeF service status and the tenant's environment (test/production).
3. Never retry an invoice blindly if KSeF may have accepted it; first query its
   reference/status to avoid duplicates.

### Backup

1. A failed backup or restore-validation job is a SEV-1 data-protection issue.
2. Preserve the failed run artifacts and check B2 availability/credentials.
3. Do not delete the previous successful backup until a new validated backup
   exists.

## Central error tracker

Sentry is the intended central tracker. It is not activated by this change because
the workspace does not yet provide a Sentry DSN/project or alert destination.
When connected, add the DSN only as an encrypted Vercel variable and configure
alerts for: API 5xx, Stripe webhook processing failures, KSeF send/status errors,
and repeated auth/rate-limit spikes. Do not capture access tokens, invoice XML,
KSeF credentials, payment details, or email bodies.
