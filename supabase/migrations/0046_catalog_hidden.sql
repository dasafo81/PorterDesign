-- ── KATALOG: usuwanie (ukrywanie) tkanin ─────────────────────────────────
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql
-- hidden = true → tkanina znika z katalogu i z wyboru w wycenach; istniejące wyceny bez zmian.

alter table catalog_items add column if not exists hidden boolean not null default false;
