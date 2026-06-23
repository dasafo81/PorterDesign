-- ── MAGAZYN ────────────────────────────────────────────────────────────────
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

create table if not exists warehouse_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  category    text not null default 'mechanizm',
  -- category: tkanina | mechanizm | gotowy | probnik | szyna
  name        text not null default '',
  quantity    numeric not null default 0,
  unit        text not null default 'szt',
  color       text not null default '',
  supplier    text not null default '',
  location    text not null default '',
  notes       text not null default '',
  length_cm   int,            -- tylko dla szyn KS
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists warehouse_items_tenant_idx on warehouse_items(tenant_id, category);

-- RLS
alter table warehouse_items enable row level security;

create policy "tenant_iso_warehouse" on warehouse_items
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_warehouse_insert" on warehouse_items for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);
