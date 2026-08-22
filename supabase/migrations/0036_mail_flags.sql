-- supabase/migrations/0036_mail_flags.sql
-- ── FLAGI MAILA (kolorowe oznaczenia wiadomosci) ────────────────────────────
-- Flaga to w praktyce kategoria Outlooka (message.categories) — dzieki temu
-- oznaczenie widac takze w samym Outlooku i synchronizuje sie miedzy urzadzeniami.
-- Aplikacja trzyma tu tylko DEFINICJE flag (nazwa + kolor), zeby kazdy tenant mial
-- swoj zestaw: u nas fioletowa "Damian", u innego studia moga byc zupelnie inne.
--
-- Jeden wiersz na tenant, lista jako jsonb:
--   [{"id":"damian","label":"Damian","color":"#8b5cf6","category":"Damian","preset":"preset8"}]
--   id       — klucz techniczny (slug), stabilny przy zmianie nazwy
--   label    — etykieta w UI
--   color    — kolor w UI (hex)
--   category — nazwa kategorii wysylana do Graph (message.categories)
--   preset   — kolor kategorii po stronie Outlooka (preset0..preset24)

create table if not exists mail_flags (
  tenant_id  uuid primary key default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  flags      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table mail_flags enable row level security;

create policy "tenant_iso_mail_flags" on mail_flags
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

create policy "tenant_iso_mail_flags_insert" on mail_flags for insert
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

drop policy if exists subscription_gate on mail_flags;
create policy subscription_gate on mail_flags
  as restrictive for all to authenticated
  using (private.pd_subscription_active())
  with check (private.pd_subscription_active());

comment on table mail_flags is
  'Definicje kolorowych flag modulu Mail (kategorie Outlooka). Jeden wiersz na tenant.';
comment on column mail_flags.flags is
  'jsonb: [{id,label,color,category,preset}]. Pusta lista = brak wlasnych flag.';
