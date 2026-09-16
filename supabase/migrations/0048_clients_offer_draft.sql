-- 0048_clients_offer_draft.sql
-- Utrwala roboczy stan ekranu "Wycena szczegółowa — podgląd" (wiersze, uwagi,
-- ważność oferty), żeby powrót do wyceny i ponowne wejście w podgląd (albo
-- odświeżenie strony / wznowienie zawieszonej karty na tablecie) nie kasowało
-- ręcznych poprawek wprowadzonych na tym ekranie.

alter table clients
  add column if not exists offer_draft jsonb;

comment on column clients.offer_draft is
  'Roboczy stan ekranu podglądu Wyceny szczegółowej: {baseRows, rows, notes, validUntil}. Odtwarzany 1:1, gdy baseRows nie zmieniło się od zapisu; w przeciwnym razie wiersze liczone są na nowo, a notes/validUntil zostają.';
