-- 0050_clients_sewing_draft.sql
-- Ostatni z ekranów "podgląd przed wygenerowaniem" — Zlecenie szycia
-- (komponent ModalSewing.jsx, tryby single/split). Ten sam mechanizm co
-- offer_draft (0048) i karnisz_draft/rails_draft/fabric_draft/simpl_draft (0049).

alter table clients
  add column if not exists sewing_draft jsonb;

comment on column clients.sewing_draft is
  'Roboczy stan ekranu podglądu Zlecenia szycia: {sourceFingerprint, mode, selHouse, customHouse, notes, term, termCurtains, termRolety, attachName, usedIds, selIds, splitHouse, splitCustom, splitNotes, splitTerm, splitAttachName, sewOpts}. Załączniki PDF (base64) celowo nie są tu przechowywane.';
