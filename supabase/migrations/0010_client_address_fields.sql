-- supabase/migrations/0010_client_address_fields.sql
-- Rozbija adres klienta na ulice / kod pocztowy / miasto,
-- zeby faktury poprawnie zaciagaly kod+miasto w osobnej linii adresu.
-- Uruchom w Supabase SQL Editor.

alter table clients
  add column if not exists postal text not null default '',
  add column if not exists city   text not null default '';

-- Uwaga: istniejacy "addr" pozostaje jako "ulica i numer" (linia 1 adresu).
-- Stare rekordy beda miec postal/city puste - trzeba je uzupelnic recznie
-- lub przy najblizszej edycji klienta.
