-- 0051: deadline zamówienia na dealu (CRM)
-- Ustawiany automatycznie (+4 tygodnie) przy przeciągnięciu deala z etapu
-- "zaliczka" do "zamowienie"; edytowalny w karcie deala.
-- Typ `date` (bez godziny) — w przeciwieństwie do visit_date / delivery_date.

alter table public.deals
  add column if not exists deadline date;

comment on column public.deals.deadline is
  'Deadline zamówienia; auto +28 dni przy przejściu zaliczka -> zamowienie, edytowalny w karcie deala';

-- OPCJONALNIE (nie uruchamiaj, jeśli nie chcesz): uzupełnienie deadline dla deali,
-- które już są w Zamówieniu / Realizacji / Montażu — 4 tygodnie od ostatniej zmiany deala.
-- update public.deals
--    set deadline = (updated_at::date + 28)
--  where stage in ('zamowienie','realizacja','montaz')
--    and deadline is null;
