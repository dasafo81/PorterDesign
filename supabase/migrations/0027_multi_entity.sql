-- ============================================================================
-- PorterDesign — Multi-podmiot (wiele dzialalnosci w jednym tenancie)
-- Migracja 0027
-- ----------------------------------------------------------------------------
-- Wprowadza wymiar `entity_id` WEWNATRZ tenanta (nie osobny tenant), zeby:
--   * przelaczac sie miedzy podmiotami w panelu faktur (np. Porter Design /
--     PD Porter Design Damian Porter),
--   * trzymac osobny token KSeF i osobna numeracje per podmiot,
--   * robic wspolne podsumowania kosztow/przychodow z wielu podmiotow
--     (trywialne, bo wszystkie zyja w jednym tenancie / pod jednym RLS).
-- Migracja jest additive i wstecznie kompatybilna: dane sprzedawcy z
-- invoice_settings staja sie "podmiotem domyslnym", a istniejace faktury/
-- liczniki/credentiale KSeF sa backfillowane do tego podmiotu.
-- ============================================================================

-- ── 0. HELPER: tenant_id z JWT ──────────────────────────────────────────────
-- W produkcji polityki uzywaja wyrazenia inline; funkcja z 0001 nie istnieje.
-- Tworzymy ja tu (idempotentnie) i uzywamy w funkcjach SECURITY DEFINER/triggerach.
create or replace function pd_current_tenant()
returns uuid language sql stable as $$
  select nullif((auth.jwt() -> 'app_metadata' ->> 'tenant_id'), '')::uuid
$$;

-- ── 1. TABELA PODMIOTOW ─────────────────────────────────────────────────────
create table if not exists entities (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  name             text not null default '',
  nip              text not null default '',
  address          text not null default '',
  postal           text not null default '',
  city             text not null default '',
  email            text not null default '',
  phone            text not null default '',
  bank             text not null default '',
  vat_status       text not null default 'czynny',            -- czynny | zwolniony
  numbering_format text not null default 'FV/{nr}/{MM}/{YYYY}',
  numbering_reset  text not null default 'monthly',           -- monthly | yearly | never
  ksef_env         text not null default 'test',              -- test | prod
  ksef_enabled     boolean not null default false,
  logo_url         text not null default '',
  is_default       boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists entities_tenant_idx on entities(tenant_id, sort_order);

alter table entities enable row level security;
-- Ten sam wzorzec co invoice_settings: PERMISSIVE izolacja tenanta + RESTRICTIVE brama subskrypcji.
drop policy if exists tenant_isolation on entities;
create policy tenant_isolation on entities
  as permissive for all to authenticated
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);
drop policy if exists subscription_gate on entities;
create policy subscription_gate on entities
  as restrictive for all to authenticated
  using (private.pd_subscription_active())
  with check (private.pd_subscription_active());

-- ── 2. SEED: podmiot domyslny dla kazdego tenanta z danymi z invoice_settings ─
-- Obejmuje kazdy tenant_id wystepujacy w danych fakturowych (nawet gdyby nie
-- mial jeszcze wiersza invoice_settings), zeby backfill entity_id nie zostawil
-- osieroconych wierszy.
insert into entities (tenant_id, name, nip, address, postal, city, email, phone, bank,
                      vat_status, numbering_format, numbering_reset, ksef_env, ksef_enabled,
                      logo_url, is_default, sort_order)
select t.tenant_id,
       coalesce(s.seller_name,''),    coalesce(s.seller_nip,''),     coalesce(s.seller_address,''),
       coalesce(s.seller_postal,''),  coalesce(s.seller_city,''),    coalesce(s.seller_email,''),
       coalesce(s.seller_phone,''),   coalesce(s.seller_bank,''),
       coalesce(s.vat_status,'czynny'),
       coalesce(s.numbering_format,'FV/{nr}/{MM}/{YYYY}'),
       coalesce(s.numbering_reset,'monthly'),
       coalesce(s.ksef_env,'test'),   coalesce(s.ksef_enabled,false),
       coalesce(s.logo_url,''),        true, 0
from (
  select tenant_id from invoice_settings where tenant_id is not null
  union select tenant_id from invoices        where tenant_id is not null
  union select tenant_id from invoice_counters where tenant_id is not null
  union select tenant_id from ksef_credentials where tenant_id is not null
) t
left join invoice_settings s on s.tenant_id = t.tenant_id
where not exists (select 1 from entities e where e.tenant_id = t.tenant_id and e.is_default);

-- ── 3. FAKTURY: kolumna entity_id + backfill do podmiotu domyslnego ──────────
alter table invoices add column if not exists entity_id uuid references entities(id);
update invoices i set entity_id = e.id
from entities e
where e.tenant_id = i.tenant_id and e.is_default and i.entity_id is null;
create index if not exists invoices_entity_idx on invoices(tenant_id, entity_id, created_at desc);

-- Trigger: dopelnij entity_id podmiotem domyslnym gdy brak (wsteczna zgodnosc ze
-- starym frontendem) i pilnuj, zeby entity_id nalezal do tego samego tenanta.
create or replace function pd_fill_entity_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := coalesce(new.tenant_id, pd_current_tenant());
begin
  if new.entity_id is null then
    select id into new.entity_id from entities where tenant_id = v_tenant and is_default limit 1;
  elsif not exists (select 1 from entities where id = new.entity_id and tenant_id = v_tenant) then
    raise exception 'entity_id nie nalezy do tenanta';
  end if;
  return new;
end $$;

drop trigger if exists trg_invoices_entity on invoices;
create trigger trg_invoices_entity before insert on invoices
  for each row execute function pd_fill_entity_id();

-- ── 4. LICZNIKI NUMERACJI: entity_id w kluczu (osobna numeracja per podmiot) ──
alter table invoice_counters add column if not exists entity_id uuid references entities(id);
update invoice_counters c set entity_id = e.id
from entities e
where e.tenant_id = c.tenant_id and e.is_default and c.entity_id is null;
-- usun ewentualne osierocone liczniki bez podmiotu (nie powinno wystapic)
delete from invoice_counters where entity_id is null;
alter table invoice_counters alter column entity_id set not null;
alter table invoice_counters drop constraint if exists invoice_counters_pkey;
alter table invoice_counters add primary key (tenant_id, entity_id, doc_type, period);

-- ── 5. CREDENTIALE KSeF: entity_id w kluczu (osobny token per podmiot) ────────
alter table ksef_credentials add column if not exists entity_id uuid references entities(id);
update ksef_credentials k set entity_id = e.id
from entities e
where e.tenant_id = k.tenant_id and e.is_default and k.entity_id is null;
delete from ksef_credentials where entity_id is null;
alter table ksef_credentials alter column entity_id set not null;
alter table ksef_credentials drop constraint if exists ksef_credentials_pkey;
alter table ksef_credentials add primary key (tenant_id, entity_id);

-- ── 6. RPC NUMERACJI (wariant per-podmiot) ──────────────────────────────────
-- Nowa sygnatura z entity_id. Jesli entity_id NULL -> podmiot domyslny tenanta.
create or replace function next_invoice_number(p_entity_id uuid, p_doc_type text, p_period text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := pd_current_tenant();
  v_entity uuid := p_entity_id;
  v_num int;
begin
  if v_tenant is null then
    raise exception 'brak tenant_id w tokenie';
  end if;
  if v_entity is null then
    select id into v_entity from entities where tenant_id = v_tenant and is_default limit 1;
  end if;
  if not exists (select 1 from entities where id = v_entity and tenant_id = v_tenant) then
    raise exception 'entity nie nalezy do tenanta';
  end if;
  insert into invoice_counters (tenant_id, entity_id, doc_type, period, last_number)
    values (v_tenant, v_entity, p_doc_type, p_period, 1)
  on conflict (tenant_id, entity_id, doc_type, period)
    do update set last_number = invoice_counters.last_number + 1
  returning last_number into v_num;
  return v_num;
end $$;
grant execute on function next_invoice_number(uuid, text, text) to authenticated;

-- Zachowaj stara sygnature (text,text) dla wstecznej zgodnosci -> podmiot domyslny.
create or replace function next_invoice_number(p_doc_type text, p_period text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := pd_current_tenant();
  v_entity uuid;
begin
  select id into v_entity from entities where tenant_id = v_tenant and is_default limit 1;
  return next_invoice_number(v_entity, p_doc_type, p_period);
end $$;
grant execute on function next_invoice_number(text, text) to authenticated;
