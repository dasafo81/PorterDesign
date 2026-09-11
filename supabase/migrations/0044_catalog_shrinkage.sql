-- supabase/migrations/0044_catalog_shrinkage.sql
-- ── KATALOG: kurczliwość tkaniny (%) — pole opcjonalne ─────────────────────
-- Edytowane w Magazyn → Katalog → edycja tkaniny. NULL = brak danych.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table catalog_items add column if not exists shrinkage_pct numeric;
