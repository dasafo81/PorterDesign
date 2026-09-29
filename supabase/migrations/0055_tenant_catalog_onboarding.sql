-- supabase/migrations/0055_tenant_catalog_onboarding.sql
-- Onboarding katalogow/cennikow dla kolejnych tenantow.
--
-- 1) Wbudowana baza (FABRICS, TAPETY, ceny mechanizmow w data.js) to dane Porter Design
--    z cenami zakupu dostawcow. Dotad widzial je KAZDY tenant. Od teraz aplikacja pokazuje
--    ja tylko gdy tenants.config.builtin_catalog = true; reszta startuje z pustym katalogiem
--    i importuje wlasny plik CSV/XLSX.
--
--    Flage dostaje najstarszy tenant (Porter Design). Jesli to nie ten, popraw recznie:
--      update tenants set config = jsonb_set(coalesce(config,'{}'), '{builtin_catalog}', 'true') where id = '<id>';
--
-- 2) Cenniki uslug (dotad stala PRICE_LISTS w kodzie) w bazie, per tenant.

update tenants
   set config = jsonb_set(coalesce(config, '{}'::jsonb), '{builtin_catalog}', 'true'::jsonb)
 where id = (select id from tenants order by created_at asc limit 1)
   and coalesce(config ->> 'builtin_catalog', '') = '';

create table if not exists tenant_price_lists (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  title       text not null,
  -- rows: [{service, net, client}] — teksty z jednostka, jak w PRICE_LISTS
  rows        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tenant_price_lists_tenant_idx on tenant_price_lists(tenant_id);

alter table tenant_price_lists enable row level security;

create policy "tenant_iso_price_lists" on tenant_price_lists
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);
