-- supabase/migrations/0009_stripe_subscriptions.sql
-- Dodaje kolumny subskrypcji Stripe do tabeli tenants.
-- Uruchom w Supabase SQL Editor.

alter table tenants
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status     text not null default 'trialing',
  -- trialing | active | past_due | canceled | incomplete
  add column if not exists plan                     text;
  -- start | studio | pro (null dopóki nie wybrano)

-- Istniejące rekordy (np. Porter Design) traktujemy jako aktywne bezterminowo,
-- żeby żaden gate nie zablokował referencyjnego salonu.
update tenants set subscription_status = 'active' where trial_ends_at is null;

comment on column tenants.subscription_status is
  'trialing = w trialu, active = opłacony abonament, past_due = platnosc nieudana (Stripe retry w toku), canceled = brak dostepu, incomplete = checkout rozpoczety niedokonczony';
