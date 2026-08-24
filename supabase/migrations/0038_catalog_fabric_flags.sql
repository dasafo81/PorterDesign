-- supabase/migrations/0038_catalog_fabric_flags.sql
-- ── KATALOG: flagi tkaniny — Trudnopalna / Dźwiękoszczelna ───────────────
-- Kategorie "Naturalne" i "Semi-Natural" liczą się automatycznie z pola
-- composition (classifyFabricComposition w src/constants/data.js) i nie
-- wymagają osobnej kolumny. Te dwie cechy nie wynikają ze składu, więc
-- muszą być zaznaczane ręcznie w formularzu katalogu.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table catalog_items add column if not exists flame_retardant boolean not null default false;
alter table catalog_items add column if not exists soundproof boolean not null default false;
