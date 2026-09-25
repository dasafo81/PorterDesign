-- 0054: kiedy faktura zostala wyslana mailem do klienta
-- Ustawiane po udanej wysylce z modulu Faktury (szczegol faktury) oraz z karty deala
-- (sekcja "Rozliczenie z klientem"). Dzieki temu status "Wyslano klientowi" w karcie
-- deala jest poprawny niezaleznie od tego, skad faktura zostala wyslana.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table public.invoices
  add column if not exists sent_at timestamptz;

comment on column public.invoices.sent_at is
  'Kiedy faktura zostala wyslana mailem do klienta (modul Faktury lub karta deala)';
