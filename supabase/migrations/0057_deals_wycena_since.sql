-- 0057: znacznik wejścia deala do etapu "Wycena" (przypomnienie o follow-upie)
-- Ustawiany przy przeniesieniu do Wyceny oraz po kliknięciu "Follow-up wykonany" na karcie deala.
-- Po 3 dniach bez ruchu kafelek dostaje znaczek 🔔, żeby wysłana wycena bez odpowiedzi nie przepadła.

alter table public.deals
  add column if not exists wycena_since timestamptz;

comment on column public.deals.wycena_since is
  'Od kiedy deal czeka w etapie Wycena bez odpowiedzi klienta (reset przez follow-up)';

-- Istniejące deale w Wycenie: licz od ostatniej zmiany
update public.deals
   set wycena_since = coalesce(updated_at, now())
 where stage = 'wycena' and wycena_since is null;
