-- 0073: koszt wizyty pomiarowej na ofercie
-- Oferta (offers) zapisywała total_gross (pozycje + montaż) i discount_amount, ale nie koszt wizyty,
-- który PDF odejmuje od "Razem". Przez to z samej oferty nie dało się odtworzyć kwoty, którą klient
-- faktycznie dostał mailem. Kwota wysłana = total_gross - discount_amount - visit_fee.
-- Idempotentna. Uruchom w Supabase SQL Editor.

alter table public.offers
  add column if not exists visit_fee numeric not null default 0;

comment on column public.offers.visit_fee is
  'Koszt wizyty pomiarowej odjęty od kwoty oferty (zł). Kwota wysłana klientowi = total_gross - discount_amount - visit_fee.';
