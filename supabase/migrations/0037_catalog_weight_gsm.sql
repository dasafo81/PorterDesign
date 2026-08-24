-- supabase/migrations/0037_catalog_weight_gsm.sql
-- ── KATALOG: gramatura tkaniny (opcjonalna, g/m²) ────────────────────────
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table catalog_items add column if not exists weight_gsm numeric;
