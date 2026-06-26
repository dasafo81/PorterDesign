-- supabase/migrations/0008_tenants_trial.sql
-- Dodaje kolumny trial i dane kontaktowe do tabeli tenants.
-- Uruchom w Supabase SQL Editor.

alter table tenants
  add column if not exists trial_ends_at  timestamptz,
  add column if not exists phone          text not null default '',
  add column if not exists nip            text not null default '';

-- Istniejące rekordy (np. Porter Design) dostają trial bezterminowy
-- (null = brak limitu — obsłużone w logice aplikacji)
