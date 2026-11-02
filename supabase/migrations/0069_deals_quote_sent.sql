-- 0069: znacznik wysłania wyceny do klienta (ekran Podsumowanie / podglądy wyceny → "Wyślij mailem")
-- Widoczny w karcie deala (CRM). Idempotentna.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table public.deals
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_sent_kind text;

comment on column public.deals.quote_sent_at is
  'Kiedy z aplikacji (Graph sendMail) wysłano klientowi mailem ostatnią wycenę';
comment on column public.deals.quote_sent_kind is
  'Rodzaj ostatnio wysłanej wyceny: uproszczona / szczegolowa';
