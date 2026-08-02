-- supabase/migrations/0021_split_doctype_from_direction.sql
-- Rozdzielenie "czym dokument JEST" (doc_type) od "w ktora strone idzie" (direction).
--
-- Do tej pory ksef-receive zapisywal KAZDA fakture zakupowa jako doc_type='zakup',
-- co mieszalo oba pojecia. Skutki:
--   * korekty zakupowe (KSeF invoiceType='Kor', kwoty ujemne) udawaly zwykle faktury,
--   * doc_type='zakup' nie istnieje w DOC_TYPES w UI, wiec filtr listy ukrywal je wszystkie
--     (naprawione osobno w ScreenInvoices.jsx przez FILTER_DOC_TYPES).
-- Od teraz doc_type niesie wylacznie typ dokumentu, a kierunek siedzi w `direction`.
--
-- Typ odtwarzamy z zapisanego XML FA(3): <RodzajFaktury> to jedyne wiarygodne zrodlo
-- dla juz istniejacych rekordow (metadanych KSeF z invoiceType nie przechowujemy).
-- KOR, KOR_ZAL, KOR_ROZ => korekta; ZAL => zaliczka; reszta (VAT/ROZ/UPR/brak) => vat.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

begin;

-- Kontrola PRZED migracja — ile rekordow i w jakim rozbiciu zostanie zmienionych.
-- (Wynik tego selecta warto zachowac przed commitem.)
select
  count(*)                                                            as do_migracji,
  count(*) filter (where xml_payload ilike '%<RodzajFaktury>KOR%')    as jako_korekta,
  count(*) filter (where xml_payload ilike '%<RodzajFaktury>ZAL%')    as jako_zaliczka,
  count(*) filter (where xml_payload is null)                         as bez_xml_fallback_vat
from invoices
where doc_type = 'zakup';

update invoices
set
  doc_type = case
    when xml_payload ilike '%<RodzajFaktury>KOR%' then 'korekta'
    when xml_payload ilike '%<RodzajFaktury>ZAL%' then 'zaliczka'
    else 'vat'
  end,
  -- direction musi byc ustawiony jawnie: po zmianie doc_type na 'vat' fallback
  -- invDirection() (doc_type==='zakup' => zakup) przestaje dzialac, wiec rekordy
  -- bez direction wyladowalyby jako sprzedazowe i zawyzyly przychody.
  direction = 'zakup',
  updated_at = now()
where doc_type = 'zakup';

-- Kontrola PO migracji — nie powinno zostac ani jednego doc_type='zakup',
-- a liczba faktur kosztowych (direction='zakup') musi sie zgadzac z ta sprzed zmiany.
select doc_type, direction, count(*)
from invoices
where direction = 'zakup'
group by doc_type, direction
order by count(*) desc;

commit;
