-- Ścinki szyn KS — każdy wiersz = jeden fizyczny kawałek szyny
create table if not exists rail_scraps (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  length_cm   int not null,
  rail_type   text not null default '',   -- np. KS Silent 19mm, KS 28mm
  color       text not null default '',   -- np. bialy, srebrny
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists rail_scraps_tenant_len_idx on rail_scraps(tenant_id, length_cm desc);

alter table rail_scraps enable row level security;

create policy "tenant_iso_rail_scraps" on rail_scraps
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_rail_scraps_insert" on rail_scraps for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);
