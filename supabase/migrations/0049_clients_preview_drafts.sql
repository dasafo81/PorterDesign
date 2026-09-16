-- 0049_clients_preview_drafts.sql
-- Powielenie mechanizmu z offer_draft (migracja 0048) na pozostałe ekrany
-- "podgląd przed wygenerowaniem": karnisze/szyny, szyny do montażu, tkanina,
-- Wycena Uproszczona. Każdy trzyma własny roboczy stan, żeby powrót do wyceny
-- i ponowne wejście w podgląd nie kasowało ręcznych poprawek.

alter table clients
  add column if not exists karnisz_draft jsonb,
  add column if not exists rails_draft jsonb,
  add column if not exists fabric_draft jsonb,
  add column if not exists simpl_draft jsonb;

comment on column clients.karnisz_draft is
  'Roboczy stan ekranu podglądu Zamówienia karniszy/szyn: {baseRows, rows}.';
comment on column clients.rails_draft is
  'Roboczy stan ekranu podglądu Szyn do montażu: {baseRows, rows}.';
comment on column clients.fabric_draft is
  'Roboczy stan ekranu podglądu Zamówienia tkaniny: {baseRows, rows, notes, sewingHouse, sewingHouseCustom}.';
comment on column clients.simpl_draft is
  'Roboczy stan ekranu podglądu Wyceny Uproszczonej: {groups, sel, validUntil, rows}.';
