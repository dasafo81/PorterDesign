-- supabase/migrations/0033_offers_discount.sql
-- ── RABAT NA OFERCIE ──────────────────────────────────────────────────────
-- Oferta (offers) dostaje kwotę przyznanego rabatu, żeby faktura wystawiana
-- "na podstawie" tej oferty mogła go pokazać. invoices dostaje snapshot
-- offer_discount — ten sam wzorzec co offer_number (zamrożony w chwili
-- wystawienia faktury, niezależny od późniejszych zmian w offers).
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table offers
  add column if not exists discount_amount numeric not null default 0;

alter table invoices
  add column if not exists offer_discount numeric not null default 0;
