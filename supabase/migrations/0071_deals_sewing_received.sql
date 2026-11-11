-- 0071: odebrane ze szwalni (na stanie) zasłony / rolety w dealu
-- Mapa {id_produktu_z_wyceny: data_odbioru "YYYY-MM-DD"} — widoczna w karcie deala i na kafelku w CRM.
-- Idempotentna. Uruchom w Supabase SQL Editor.

alter table public.deals
  add column if not exists sewing_received jsonb not null default '{}'::jsonb;

comment on column public.deals.sewing_received is
  'Pozycje uszyte i odebrane (na stanie, gotowe do montażu): {id produktu: data odbioru}';
