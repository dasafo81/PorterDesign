-- supabase/migrations/0032_offers.sql
-- ── OFERTY (historia numerów ofert generowanych dla klienta) ────────────────
-- Do tej pory numer oferty (getPDFOfferNumber) był tylko efemeryczną etykietą
-- na wygenerowanym PDF-ie — nigdy nie trafiał do bazy, więc nie dało się z niego
-- skorzystać przy wystawianiu faktury. Od teraz każda wygenerowana oferta
-- (Wycena szczegółowa / Wycena Uproszczona) zapisuje tu swój numer, powiązany
-- z klientem (clients.id). Faktury (invoices) dostają kolumnę offer_id + snapshot
-- offer_number — ten sam wzorzec co seller_snapshot/buyer_* (numer zamrożony
-- w chwili wystawienia faktury, niezależny od późniejszych zmian w tabeli offers).
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

create table if not exists offers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  client_id    bigint not null,                       -- link do clients.id (bez FK — jak invoices.client_id)
  number       text not null default '',               -- np. "OF-20260820-Kowalska"
  kind         text not null default 'szczegolowa',    -- szczegolowa | uproszczona
  total_gross  numeric not null default 0,
  valid_until  date,
  notes        text not null default '',
  status       text not null default 'wygenerowana',   -- rezerwa na przyszłość (zaakceptowana | zamowienie...)
  created_at   timestamptz not null default now()
);

create index if not exists offers_tenant_idx on offers(tenant_id, created_at desc);
create index if not exists offers_client_idx on offers(tenant_id, client_id, created_at desc);

-- RLS — izolacja po tenancie (wzorzec identyczny jak contacts / warehouse_items)
alter table offers enable row level security;

create policy "tenant_iso_offers" on offers
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_offers_insert" on offers for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

-- ── Powiązanie faktury z ofertą (opcjonalne) ─────────────────────────────────
alter table invoices
  add column if not exists offer_id     uuid references offers(id) on delete set null,
  add column if not exists offer_number text not null default '';

create index if not exists invoices_offer_idx on invoices(offer_id);
