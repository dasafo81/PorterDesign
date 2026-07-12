-- ── KATALOG: skład tkaniny ───────────────────────────────────────────────
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table catalog_items add column if not exists composition text;
