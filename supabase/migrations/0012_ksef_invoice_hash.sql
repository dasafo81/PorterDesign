-- supabase/migrations/0012_ksef_invoice_hash.sql
-- Kolumna na SHA-256 XML-a faktury zapisywany w momencie wysylki do KSeF.
-- Uzywana do zbudowania oficjalnego URL weryfikacji (Kod QR I) na fakturze:
--   https://qr.ksef.mf.gov.pl/invoice/{NIP}/{DD-MM-YYYY}/{ksef_invoice_hash}
--
-- Powod istnienia osobnej kolumny (nie liczymy hasha z xml_payload w frontendzie):
-- Sync z KSeF (ksef-receive) nadpisuje xml_payload canonical wersja XML zwracana
-- przez KSeF — jej hash rozni sie od hasha oryginalu ktory poszedl na sesje online.
-- Trzymanie hasha osobno gwarantuje, ze QR generowany dziesiec dni pozniej wciaz
-- pasuje do tego co KSeF zobaczy przy weryfikacji.
--
-- Format: Base64URL bez padding ('+' -> '-', '/' -> '_', usuniete '='),
-- gotowy do wklejenia do URL bez dodatkowego kodowania.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

alter table invoices
  add column if not exists ksef_invoice_hash text;

comment on column invoices.ksef_invoice_hash is
  'SHA-256 XML-a faktury (Base64URL bez padding) zapisywany w chwili wysylki do KSeF przez ksef-send. Uzywany do budowy oficjalnego URL weryfikacji QR (Kod I). NIE nadpisywac przy synchronizacji z KSeF — canonical XML z KSeF ma inny hash niz oryginal wyslany.';
