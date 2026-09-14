-- supabase/migrations/0047_catalog_sheer.sql
-- ── KATALOG: etykieta "Półprzezierne" dla tkanin ─────────────────────────
-- Półprzezierność nie wynika ze składu ani z nazwy (jak Naturalne/Blackout),
-- więc — tak jak Welur czy Basic — zaznaczana jest ręcznie w formularzu katalogu.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table catalog_items add column if not exists polprzezierne boolean not null default false;
