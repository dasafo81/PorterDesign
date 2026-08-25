-- supabase/migrations/0040_client_snapshots.sql
-- Historia wersji klientow: przy kazdej zmianie kolumny `rooms` trigger odklada
-- POPRZEDNI stan do tabeli client_snapshots.
--
-- Po co: guard `updated_at` w sbApi.updateClient (migracja 0039 / App.jsx) blokuje
-- nadpisanie danych przez karte trzymajaca stary stan, ale dziala tylko przy zapisie
-- i tylko w aplikacji. Ta warstwa jest niezalezna od frontendu -- nawet przy bledzie
-- logiki, recznym PATCH-u czy wyscigu miedzy 4 urzadzeniami poprzednia wersja
-- jest odzyskiwalna. (Incydent 2026-08-25.)
--
-- Uruchom w SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql
-- Bloki create function zwroca "Success. No rows returned" -- to normalne.

-- ── 1. TABELA ────────────────────────────────────────────────────────────────
create table if not exists client_snapshots (
  id            bigint generated always as identity primary key,
  tenant_id     uuid   not null,
  client_id     bigint not null,
  snapshot      jsonb  not null,
  product_count int    not null default 0,
  changed_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists client_snapshots_client_idx
  on client_snapshots(client_id, created_at desc);
create index if not exists client_snapshots_tenant_idx
  on client_snapshots(tenant_id, created_at desc);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
alter table client_snapshots enable row level security;

drop policy if exists client_snapshots_tenant on client_snapshots;
create policy client_snapshots_tenant on client_snapshots
  for all to authenticated
  using      (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

-- UWAGA: swiadomie BEZ restrictive subscription_gate. Kopie zapasowe musza byc
-- czytelne takze wtedy, gdy subskrypcja chwilowo wygasnie -- inaczej blokada
-- platnosci odcielaby dostep do wlasnych danych historycznych.

-- ── 3. HELPER: liczba produktow w JSON-ie rooms ───────────────────────────────
create or replace function private.pd_count_products(p_rooms jsonb)
returns int
language sql
immutable
as $$
  select coalesce((
    select sum(jsonb_array_length(w->'products'))
    from jsonb_array_elements(
           case when jsonb_typeof(p_rooms)='array' then p_rooms else '[]'::jsonb end) r,
         jsonb_array_elements(
           case when jsonb_typeof(r->'windows')='array' then r->'windows' else '[]'::jsonb end) w
    where jsonb_typeof(w->'products')='array'
  ),0)::int
$$;

-- ── 4. TRIGGER ───────────────────────────────────────────────────────────────
create or replace function private.pd_clients_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnt int;
begin
  -- Snapshot tylko przy realnej zmianie tresci wyceny.
  if OLD.rooms is not distinct from NEW.rooms then
    return NEW;
  end if;

  v_cnt := private.pd_count_products(OLD.rooms);

  -- Dedup: autosave leci po kazdej zmianie pola. Nie zapisujemy nowej wersji,
  -- jesli w ostatnich 2 minutach mamy juz wersje o tej samej liczbie produktow.
  if exists (
    select 1 from client_snapshots
    where client_id = OLD.id
      and created_at > now() - interval '2 minutes'
      and product_count = v_cnt
  ) then
    return NEW;
  end if;

  insert into client_snapshots (tenant_id, client_id, snapshot, product_count, changed_by)
  values (
    OLD.tenant_id,
    OLD.id,
    jsonb_build_object(
      'name',             OLD.name,
      'rooms',            OLD.rooms,
      'commission',       OLD.commission,
      'install_fee',      OLD.install_fee,
      'install_fee_mode', OLD.install_fee_mode,
      'updated_at',       OLD.updated_at
    ),
    v_cnt,
    coalesce(auth.jwt() ->> 'email', 'system')
  );

  -- Retencja: sporadycznie przycinamy do 60 ostatnich wersji na klienta.
  if random() < 0.05 then
    delete from client_snapshots cs
    where cs.client_id = OLD.id
      and cs.id < (
        select min(id) from (
          select id from client_snapshots
          where client_id = OLD.id
          order by id desc
          limit 60
        ) t
      );
  end if;

  return NEW;
end $$;

drop trigger if exists trg_clients_snapshot on clients;
create trigger trg_clients_snapshot
  before update on clients
  for each row execute function private.pd_clients_snapshot();

-- ── 5. WERYFIKACJA (uruchom osobno po migracji) ──────────────────────────────
-- select tgname, tgenabled from pg_trigger where tgrelid = 'clients'::regclass;
-- select private.pd_count_products(rooms), name from clients order by id desc limit 5;
