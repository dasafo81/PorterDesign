-- ============================================================================
-- PorterDesign — Modul Faktury (multi-tenant, JDG/VAT, KSeF-ready)
-- Migracja 0001 — schemat bazy
-- ----------------------------------------------------------------------------
-- UWAGA: wzorzec izolacji tenanta jest taki sam jak w tabeli `clients`:
--   * kolumna tenant_id z DEFAULT czytanym z JWT (app_metadata.tenant_id)
--   * RLS porownuje tenant_id wiersza z tenant_id z JWT
-- Jezeli istniejace tabele uzywaja innego helpera (np. funkcji current_tenant_id()),
-- podmien wyrazenie ((auth.jwt()->'app_metadata'->>'tenant_id'))::uuid w calym pliku.
-- ============================================================================

-- pomocniczy: tenant_id zalogowanego usera z JWT
create or replace function pd_current_tenant()
returns uuid language sql stable as $$
  select nullif((auth.jwt() -> 'app_metadata' ->> 'tenant_id'), '')::uuid
$$;

-- ── 1. USTAWIENIA FAKTUROWANIA (1 wiersz na tenanta) ────────────────────────
create table if not exists invoice_settings (
  tenant_id          uuid primary key default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  seller_name        text not null default '',
  seller_nip         text not null default '',
  seller_address     text not null default '',
  seller_postal      text not null default '',
  seller_city        text not null default '',
  seller_email       text not null default '',
  seller_phone       text not null default '',
  seller_bank        text not null default '',          -- numer konta (IBAN)
  vat_status         text not null default 'czynny',    -- czynny | zwolniony
  numbering_format   text not null default 'FV/{nr}/{MM}/{YYYY}',
  numbering_reset    text not null default 'monthly',   -- monthly | yearly | never
  default_vat        numeric not null default 23,       -- -1 oznacza 'zw'
  default_payment_days int not null default 14,
  default_payment_method text not null default 'przelew',
  default_unit       text not null default 'szt',
  logo_url           text not null default '',
  ksef_env           text not null default 'test',      -- test | prod
  ksef_enabled       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── 2. FAKTURY (naglowek) ───────────────────────────────────────────────────
create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  number        text,                                   -- nadawany przy wystawieniu
  doc_type      text not null default 'vat',            -- vat|proforma|zaliczka|koncowa|korekta|uproszczona
  status        text not null default 'draft',          -- draft|issued|sent|cancelled
  issue_date    date,
  sale_date     date,
  due_date      date,
  payment_method text not null default 'przelew',
  payment_status text not null default 'unpaid',        -- unpaid|partial|paid
  paid_amount   numeric not null default 0,
  -- nabywca (snapshot na fakturze)
  buyer_name    text not null default '',
  buyer_nip     text not null default '',
  buyer_address text not null default '',
  buyer_postal  text not null default '',
  buyer_city    text not null default '',
  buyer_email   text not null default '',
  client_id     bigint,                                 -- link do clients (opcjonalny)
  deal_id       uuid,                                   -- link do deals/CRM (opcjonalny)
  -- sprzedawca zamrozony w chwili wystawienia
  seller_snapshot jsonb not null default '{}'::jsonb,
  -- sumy
  total_net     numeric not null default 0,
  total_vat     numeric not null default 0,
  total_gross   numeric not null default 0,
  currency      text not null default 'PLN',
  notes         text not null default '',
  -- korekta
  corrects_invoice_id uuid,                             -- faktura korygowana
  correction_reason   text not null default '',
  -- KSeF
  ksef_status   text not null default 'none',           -- none|pending|sent|confirmed|offline|error
  ksef_number   text,
  ksef_upo      text,
  ksef_mode     text,                                   -- online|offline24|awaryjny
  ksef_error    text,
  ksef_sent_at  timestamptz,
  xml_payload   text,                                   -- wygenerowany XML FA(3)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists invoices_tenant_idx     on invoices(tenant_id, created_at desc);
create index if not exists invoices_client_idx     on invoices(client_id);
create index if not exists invoices_deal_idx       on invoices(deal_id);
create index if not exists invoices_ksefstatus_idx on invoices(tenant_id, ksef_status);

-- ── 3. POZYCJE FAKTURY ──────────────────────────────────────────────────────
create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  position    int  not null default 1,
  name        text not null default '',
  quantity    numeric not null default 1,
  unit        text not null default 'szt',
  unit_net    numeric not null default 0,               -- cena jednostkowa netto
  vat_rate    numeric not null default 23,              -- -1 = 'zw'
  line_net    numeric not null default 0,
  line_vat    numeric not null default 0,
  line_gross  numeric not null default 0,
  pkwiu       text not null default ''
);
create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id);

-- ── 4. LICZNIKI NUMERACJI (per tenant / typ / okres) ───────────────────────
create table if not exists invoice_counters (
  tenant_id   uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  doc_type    text not null,
  period      text not null,                            -- np. '2026-06' | '2026' | 'all'
  last_number int  not null default 0,
  primary key (tenant_id, doc_type, period)
);

-- ── 5. CREDENTIALE KSeF (TYLKO server-side / service_role) ──────────────────
-- Brak polityki RLS dla authenticated/anon => front nie ma dostepu.
-- Czyta/zapisuje wylacznie backend (Edge Function) przez service_role.
create table if not exists ksef_credentials (
  tenant_id        uuid primary key,
  env              text not null default 'test',
  token_encrypted  text,                                -- token KSeF (szyfrowany)
  cert_pem         text,                                -- certyfikat (.crt)
  key_encrypted    text,                                -- klucz prywatny (.key) szyfrowany
  cert_pass_enc    text,                                -- haslo do klucza (szyfrowane)
  updated_at       timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table invoice_settings  enable row level security;
alter table invoices          enable row level security;
alter table invoice_items     enable row level security;
alter table invoice_counters  enable row level security;
alter table ksef_credentials  enable row level security;

-- izolacja po tenancie (SELECT/INSERT/UPDATE/DELETE) dla authenticated
do $$
declare t text;
begin
  foreach t in array array['invoice_settings','invoices','invoice_items','invoice_counters']
  loop
    execute format($f$
      drop policy if exists tenant_isolation on %1$I;
      create policy tenant_isolation on %1$I
        for all to authenticated
        using (tenant_id = pd_current_tenant())
        with check (tenant_id = pd_current_tenant());
    $f$, t);
  end loop;
end $$;

-- ksef_credentials: zadnego dostepu dla authenticated/anon (tylko service_role omija RLS)
drop policy if exists no_client_access on ksef_credentials;
create policy no_client_access on ksef_credentials
  for all to authenticated using (false) with check (false);

-- ── FUNKCJA: atomowe nadanie kolejnego numeru ──────────────────────────────
-- Zwraca kolejny last_number dla (tenant z JWT, doc_type, period). Bez wyscigow.
create or replace function next_invoice_number(p_doc_type text, p_period text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := pd_current_tenant();
  v_num int;
begin
  if v_tenant is null then
    raise exception 'brak tenant_id w tokenie';
  end if;
  insert into invoice_counters (tenant_id, doc_type, period, last_number)
    values (v_tenant, p_doc_type, p_period, 1)
  on conflict (tenant_id, doc_type, period)
    do update set last_number = invoice_counters.last_number + 1
  returning last_number into v_num;
  return v_num;
end $$;

grant execute on function next_invoice_number(text, text) to authenticated;
