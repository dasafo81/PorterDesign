-- supabase/migrations/0035_cost_rates.sql
-- ── STAWKI KOSZTOWE (jedna linia na tenant) ─────────────────────────────────
-- Ceny zakupu tkanin sa juz w cenniku (FABRICS.zakup / catalog_items.purchase_price),
-- ale kosztu SZYCIA nie ma nigdzie — sprzedajemy po 100/110/120 zl/mb i 200 zl/m2,
-- natomiast ile placimy szwalni, wie tylko Damian. Te cztery liczby zamykaja
-- wyliczenie marzy dla kazdego zlecenia wstecz, bez wpisywania czegokolwiek recznie.
--
-- Wartosci NULL sa celowe: costOf() traktuje brak stawki jako "nie wiem" i oznacza
-- marze jako niepelna, zamiast po cichu przyjac zero i zawyzyc wynik.

create table if not exists cost_rates (
  tenant_id        uuid primary key default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  sew_curtain_mb   numeric,   -- placimy szwalni za mb szycia zaslony/firany
  sew_roman_m2     numeric,   -- placimy szwalni za m2 rolety rzymskiej
  lining_mb        numeric,   -- cena zakupu podszewki za mb
  mech_divisor     numeric not null default 2.46,
  -- Cenniki lookup (mechanizmy, zaluzje, karnisze) budowane sa wzorem
  -- netto x 1,23 x 2, wiec koszt netto ~ detal / 2,46. Zalozenie z wlasnej
  -- reguly cenowej — do weryfikacji na fakturze od Szyn KS.
  updated_at       timestamptz not null default now()
);

alter table cost_rates enable row level security;

create policy "tenant_iso_cost_rates" on cost_rates
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_cost_rates_insert" on cost_rates for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

drop policy if exists subscription_gate on cost_rates;
create policy subscription_gate on cost_rates
  as restrictive for all to authenticated
  using (private.pd_subscription_active())
  with check (private.pd_subscription_active());

comment on table cost_rates is
  'Stawki kosztowe do wyliczania marzy ze zuzycia materialow. Jeden wiersz na tenant.';
