-- 0042_client_quote_no.sql
-- Numer wyceny: kazda wycena (wiersz clients) dostaje staly, unikalny numer
-- w formacie OF/NN/MM/YYYY, np. OF/01/09/2026. Numeracja per tenant,
-- od 01 w kazdym miesiacu. Ten sam numer trafia na liste wycen, Wycene
-- uproszczona i Wycene szczegolowa (getPDFOfferNumber w data.js).
--
-- Numer nadaje BAZA (trigger BEFORE INSERT) -- nie frontend. Dzieki temu dwa
-- urzadzenia zakladajace wycene w tej samej sekundzie nie dostana tego samego
-- numeru (advisory lock per tenant+miesiac), a klienci zakladani offline dostaja
-- numer w chwili synchronizacji.
-- Numer jest niezmienny (trigger BEFORE UPDATE) i nie jest odzyskiwany po
-- usunieciu -- klienci w Koszu tez licza sie do sekwencji.
--
-- Uruchom w SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql
-- Bloki create function zwroca "Success. No rows returned" -- to normalne.

-- ── 1. KOLUMNA ───────────────────────────────────────────────────────────────
alter table clients add column if not exists quote_no text not null default '';

-- ── 2. BACKFILL istniejacych wycen (wg daty utworzenia, w obrebie miesiaca) ──
with numbered as (
  select id,
         to_char(created_at at time zone 'Europe/Warsaw','MM/YYYY') as mmyyyy,
         row_number() over (
           partition by tenant_id, to_char(created_at at time zone 'Europe/Warsaw','YYYY-MM')
           order by created_at, id
         ) as nr
  from clients
  where coalesce(quote_no,'') = ''
)
update clients c
set quote_no = 'OF/' || lpad(n.nr::text, 2, '0') || '/' || n.mmyyyy
from numbered n
where c.id = n.id;

-- ── 3. UNIKALNOSC ────────────────────────────────────────────────────────────
create unique index if not exists clients_quote_no_uq
  on clients (tenant_id, quote_no)
  where quote_no <> '';

-- ── 4. TRIGGER: nadanie numeru przy INSERT ───────────────────────────────────
create or replace function private.pd_clients_quote_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suffix text;
  v_next   int;
begin
  -- Zawsze nadajemy nowy numer (takze kopii klienta / wycenie z synchronizacji
  -- offline) -- ignorujemy ewentualny quote_no przyslany z frontendu.
  v_suffix := to_char(now() at time zone 'Europe/Warsaw', 'MM/YYYY');

  perform pg_advisory_xact_lock(hashtext('pd_quote_no:' || coalesce(NEW.tenant_id::text,'') || ':' || v_suffix));

  select coalesce(max(nullif(split_part(quote_no, '/', 2), '')::int), 0) + 1
    into v_next
  from clients
  where tenant_id is not distinct from NEW.tenant_id
    and quote_no like 'OF/%/' || v_suffix;

  NEW.quote_no := 'OF/' || lpad(v_next::text, 2, '0') || '/' || v_suffix;
  return NEW;
end;
$$;

drop trigger if exists trg_clients_quote_no on clients;
create trigger trg_clients_quote_no
  before insert on clients
  for each row execute function private.pd_clients_quote_no();

-- ── 5. TRIGGER: numer niezmienny przy UPDATE ─────────────────────────────────
create or replace function private.pd_clients_quote_no_lock()
returns trigger
language plpgsql
as $$
begin
  if coalesce(OLD.quote_no,'') <> '' then
    NEW.quote_no := OLD.quote_no;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_clients_quote_no_lock on clients;
create trigger trg_clients_quote_no_lock
  before update of quote_no on clients
  for each row execute function private.pd_clients_quote_no_lock();

-- ── 6. WERYFIKACJA ───────────────────────────────────────────────────────────
select id, name, created_at, quote_no
from clients
order by created_at desc
limit 20;
