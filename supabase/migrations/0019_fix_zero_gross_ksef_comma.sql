-- supabase/migrations/0019_fix_zero_gross_ksef_comma.sql
-- Naprawa danych: bug w ksef-receive (parseFA) liczyl total_gross faktury jako
-- `+(xmlVal(xml, "P_15") || 0)` — surowa konwersja JS na liczbe, bez przejscia przez
-- numVal() (ktora zamienia przecinek dziesietny na kropke). Niektorzy dostawcy zapisuja
-- P_15 z przecinkiem ("1234,56"); `+"1234,56"` daje NaN, a NaN przy zapisie do bazy
-- (przez asNum()) zamienial sie w 0. Pozycje faktury (invoice_items) zawsze szly przez
-- numVal (P_9A/P_11/P_12), wiec total_net/total_vat naglowka (liczone z sumy pozycji)
-- zostawaly poprawne — tylko total_gross w naglowku wychodzil zerowy mimo realnych
-- pozycji. Stad "faktury z kwota 0 zl mimo pozycji" (zgloszenie 2026-07-27).
--
-- Kod naprawiony w supabase/functions/ksef-receive/index.ts (commit 880a3a1) — total_gross
-- liczy sie teraz przez numVal(xmlVal(xml, "P_15")), tak samo jak pozostale pola numeryczne.
--
-- Ten skrypt przelicza juz zepsute rekordy: total_gross=0 mimo total_net>0 — poniewaz
-- total_net/total_vat tych faktur SA juz poprawne (liczone z invoice_items, ktore nie mialy
-- tego buga), total_gross = total_net + total_vat jest bezpiecznym zrodlem prawdy, bez
-- potrzeby ponownego odpytywania KSeF.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

-- Podglad przed zmiana (opcjonalnie odpal najpierw, zeby zobaczyc skale problemu):
-- select id, number, doc_type, direction, issue_date, ksef_number,
--        total_net, total_vat, total_gross
-- from invoices
-- where total_gross = 0 and total_net <> 0
-- order by issue_date desc;

update invoices
set total_gross = round((total_net + total_vat)::numeric, 2),
    updated_at = now()
where total_gross = 0
  and total_net <> 0;

-- Kontrola po naprawie: powinno zwrocic tylko faktury, ktore SA faktycznie zerowe
-- (total_net rowniez = 0 — np. prawdziwe korekty do zera), do recznego sprawdzenia.
-- select id, number, doc_type, direction, issue_date, total_net, total_gross
-- from invoices
-- where total_gross = 0
-- order by issue_date desc;
