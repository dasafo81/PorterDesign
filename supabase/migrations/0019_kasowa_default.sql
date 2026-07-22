-- supabase/migrations/0019_kasowa_default.sql
-- Metoda kasowa jako ustawienie tenanta.
--
-- Powod: ksiegowa (VIP Account, 2026-07-22) zglosila sprzecznosc na fakturach
-- sprzedazowych w KSeF — <DodatkowyOpis> zawieral wolny tekst "Metoda Kasowa",
-- podczas gdy Adnotacje/P_16 mialo wartosc 2 (Nie). W FA(3) jedynym poprawnym
-- miejscem tej adnotacji jest P_16; ksef-send czyta ja z invoices.kasowa.
--
-- PD Porter Design rozlicza sie metoda kasowa ZAWSZE, wiec flaga musi byc
-- domyslnie wlaczona, a nie zalezec od tego, czy ktos pamietal o checkboxie.
-- Kolumna jest per tenant (domyslnie false) — inne studia korzystajace
-- z Asystenta Dekoracji nie sa malymi podatnikami na metodzie kasowej.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

alter table invoice_settings
  add column if not exists kasowa_default boolean not null default false;

-- Tenant PD Porter Design
update invoice_settings
set kasowa_default = true
where tenant_id = 'a0000000-0000-4000-8000-000000000001';

-- Wyrownanie danych historycznych: faktury sprzedazowe (bez EKO) tego tenanta,
-- ktore powstaly zanim flaga byla ustawiana automatycznie. Wplywa na PDF
-- (napis "Metoda Kasowa") — faktur juz wyslanych do KSeF to nie zmienia.
update invoices
set kasowa = true
where tenant_id = 'a0000000-0000-4000-8000-000000000001'
  and coalesce(direction, 'sprzedaz') = 'sprzedaz'
  and doc_type <> 'eko'
  and coalesce(kasowa, false) = false;
