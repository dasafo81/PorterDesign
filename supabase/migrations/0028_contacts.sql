-- ── KONTRAHENCI (baza klientów i dostawców) ─────────────────────────────────
-- Centralna baza kontaktów (na wzór Fakturowni): klienci (odbiorcy) i dostawcy.
-- Z tej bazy korzystają zarówno Wyceny (clients.contact_id), jak i Faktury
-- (invoices.contact_id). Snapshoty nabywcy/sprzedawcy na fakturach zostają
-- nietknięte (wymogi KSeF) — kontrahent jest tylko referencją/źródłem autouzupełnienia.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

create table if not exists contacts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  kind                 text not null default 'firma',    -- firma | osoba
  role                 text not null default 'klient',   -- klient | dostawca | oba
  name                 text not null default '',
  nip                  text not null default '',
  regon                text not null default '',
  street               text not null default '',         -- ulica i numer
  postal               text not null default '',
  city                 text not null default '',
  email                text not null default '',
  phone                text not null default '',
  bank                 text not null default '',         -- numer konta (IBAN)
  default_vat          numeric not null default 23,      -- -1 = 'zw'
  default_payment_days int  not null default 14,
  tags                 text[] not null default '{}',
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists contacts_tenant_idx on contacts(tenant_id, created_at desc);
create index if not exists contacts_nip_idx    on contacts(tenant_id, nip);

-- RLS — izolacja po tenancie (wzorzec identyczny jak warehouse_items)
alter table contacts enable row level security;

create policy "tenant_iso_contacts" on contacts
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_contacts_insert" on contacts for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

-- Powiązania z dokumentami (opcjonalne — Faza 2 podpina je w UI)
alter table clients
  add column if not exists contact_id uuid references contacts(id) on delete set null;

alter table invoices
  add column if not exists contact_id uuid references contacts(id) on delete set null;

create index if not exists clients_contact_idx  on clients(contact_id);
create index if not exists invoices_contact_idx on invoices(contact_id);
