-- 0051_clients_sewing_draft_rows.sql
-- Ekran "Zlecenie szycia" (ModalSewing.jsx) dostaje edytowalna specyfikacje
-- pozycji (tkanina, model szycia, wymiary, mechanizm rolety itd.), tak jak
-- pozostale ekrany "podglad przed wygenerowaniem". Kolumna sewing_draft (0050)
-- nie wymaga zmiany struktury (jsonb) -- aktualizujemy tylko opis zawartosci.

comment on column clients.sewing_draft is
  'Roboczy stan ekranu podgladu Zlecenia szycia: {sourceFingerprint, mode, selHouse, customHouse, notes, term, termCurtains, termRolety, attachName, usedIds, selIds, splitHouse, splitCustom, splitNotes, splitTerm, splitAttachName, sewOpts, rows}. rows to edytowalne pozycje z buildSewingRows (wspolne dla trybu single i split -- indeksy usedIds/selIds wskazuja na ta sama tablice). Zalaczniki PDF (base64) celowo nie sa tu przechowywane.';
