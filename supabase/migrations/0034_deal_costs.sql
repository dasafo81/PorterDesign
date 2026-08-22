-- supabase/migrations/0034_deal_costs.sql
-- ── KOSZTY ZLECENIA (strona kosztowa dealu) ─────────────────────────────────
-- Do tej pory aplikacja znała wyłącznie cenę SPRZEDAŻY. Koszty składowe
-- (tkanina, szycie, osprzęt, wypłata montażysty) liczyły się w calc() w locie
-- i ginęły — do clients.rooms trafiała tylko cena pozycji. Bez nich nie da się
-- policzyć marży ani na zleceniu, ani na typie dekoracji.
--
-- Świadomie OSOBNA TABELA, nie kolumny na deals: jedno zlecenie miewa dwa
-- zamówienia tkaniny, dwóch montażystów i kilka wypłat w różnych terminach.
-- Jeden wiersz = jedno realne wydanie pieniędzy.
--
-- invoice_id jest opcjonalny — zostaje pusty przy wypłacie gotówkowej dla
-- montażysty, a wypełnia się, gdy koszt ma pokrycie w fakturze zakupowej
-- (invoices.deal_id już istnieje od migracji 0001, nie trzeba go dodawać).
--
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

create table if not exists deal_costs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  deal_id           uuid not null references deals(id) on delete cascade,
  kind              text not null default 'tkanina',
  -- kind: tkanina | szycie | osprzet | montaz | transport | inne
  amount            numeric not null default 0,        -- kwota wydana (PLN)
  supplier          text    not null default '',       -- Vadain / LaurAles / Szyny KS / ...
  installer_name    text    not null default '',       -- tylko dla kind='montaz'
  paid_at           date,                              -- data przelewu / zapłaty
  planned_delivery  date,                              -- termin ZADEKLAROWANY przez dostawcę
  actual_delivery   date,                              -- termin FAKTYCZNY (opóźnienia dostawców)
  invoice_id        uuid references invoices(id) on delete set null,
  note              text    not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists deal_costs_deal_idx   on deal_costs(deal_id, created_at);
create index if not exists deal_costs_tenant_idx on deal_costs(tenant_id, paid_at desc);
create index if not exists deal_costs_kind_idx   on deal_costs(tenant_id, kind);

-- RLS — wzorzec identyczny jak offers / contacts / warehouse_items
alter table deal_costs enable row level security;

create policy "tenant_iso_deal_costs" on deal_costs
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_deal_costs_insert" on deal_costs for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

-- Gate subskrypcji — tabela ma tenant_id, więc obejmuje ją wzorzec z migracji 0023.
-- Pętla z 0023 działa tylko na tabelach istniejących w chwili jej uruchomienia,
-- dlatego zakładamy politykę ręcznie dla tej nowej tabeli.
drop policy if exists subscription_gate on deal_costs;
create policy subscription_gate on deal_costs
  as restrictive for all to authenticated
  using (private.pd_subscription_active())
  with check (private.pd_subscription_active());

comment on table deal_costs is
  'Strona kosztowa zlecenia. Jeden wiersz = jedno wydanie (zamowienie u dostawcy lub wyplata dla montazysty). NIE mylic z clients.install_fee, ktore jest kwota placona PRZEZ klienta.';
