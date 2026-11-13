-- 0072: zapamiętany koszt wizyty pomiarowej na kliencie
-- Dotąd zaznaczenie "Koszt wizyty pomiarowej" i kwota żyły tylko w localStorage przeglądarki
-- (pd_adj_<id>), więc znikały na innym urządzeniu. Teraz są zapisywane przy kliencie,
-- tak jak Polecenie (commission) i Montaż (install_fee).
-- Idempotentna. Uruchom w Supabase SQL Editor.

alter table public.clients
  add column if not exists visit_fee_enabled boolean not null default false,
  add column if not exists visit_fee text;

comment on column public.clients.visit_fee_enabled is
  'Czy odliczać koszt wizyty pomiarowej od całości wyceny (checkbox w Podsumowaniu).';
comment on column public.clients.visit_fee is
  'Kwota kosztu wizyty pomiarowej w zł (tekst jak w polu; domyślnie 250 w aplikacji).';
