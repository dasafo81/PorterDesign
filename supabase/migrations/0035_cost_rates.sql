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

-- ── Uzupełnienie: koszt szycia jako % wartości z wyceny ─────────────────────
-- W wycenie szycie idzie po 100/110/120 zl/mb (zaslony) i 200 zl/m2 (rolety).
-- Jesli placimy szwalni dokladnie tyle, ile bierzemy od klienta (marza siedzi
-- w tkaninie), to koszt = wartosc z wyceny x 100%. Jesli szycie ma narzut,
-- ustaw procent nizej (np. 60 = placimy 60% tego, co sprzedajemy).
-- Wypelnione sew_curtain_mb / sew_roman_m2 maja pierwszenstwo przed procentem.
alter table cost_rates add column if not exists sew_quote_pct numeric not null default 100;

comment on column cost_rates.sew_quote_pct is
  'Koszt szycia jako % wartosci szycia z wyceny. 100 = sprzedajemy po kosztach.';

-- ── Korekta domyslnej wartosci: szycie sprzedajemy z marza 100% ─────────────
-- Cena szycia dla klienta = nasz koszt x 2, wiec koszt = 50% wartosci z wyceny.
-- UPDATE dotyka tylko wierszy zostawionych na starym domysle 100 — recznie
-- ustawiony procent (np. 60) zostaje nietkniety.
alter table cost_rates alter column sew_quote_pct set default 50;
update cost_rates set sew_quote_pct = 50 where sew_quote_pct = 100;

-- ── Korekta dzielnika pozycji gotowych ──────────────────────────────────────
-- Szyny KS (i pozostale pozycje z cennikow lookup) sprzedajemy na tej samej
-- zasadzie co szycie: cena dla klienta = nasz koszt x 2. Wczesniejsze 2,46
-- zakladalo dodatkowo narzut VAT w cenniku — bledne zalozenie.
alter table cost_rates alter column mech_divisor set default 2;
update cost_rates set mech_divisor = 2 where mech_divisor = 2.46;
