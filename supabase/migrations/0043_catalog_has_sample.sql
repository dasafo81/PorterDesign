-- supabase/migrations/0043_catalog_has_sample.sql
-- ── KATALOG: znacznik "Mamy próbnik" dla tkanin ─────────────────────────────
-- Odhaczany ręcznie na karcie tkaniny w Magazyn → Katalog (lub w formularzu edycji).
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table catalog_items add column if not exists has_sample boolean not null default false;
