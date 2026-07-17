-- supabase/migrations/0017_fix_eko_header_totals.sql
-- Naprawa danych: dla dokumentow EKO (doc_type='eko', dowolny kierunek) kolumny
-- invoices.total_vat / invoices.total_gross byly liczone w edytorze (ScreenInvoices.jsx)
-- z surowych pozycji (z oryginalna stawka VAT wybrana w wierszu, np. 23%) PRZED
-- wyzerowaniem VAT, ktore dzialo sie dopiero przy zapisie do invoice_items.
-- Efekt: naglowek faktury (total_gross) byl zawyzony o VAT, ktorego faktycznie nie ma
-- (invoice_items tej samej faktury mialy juz vat_rate=0 / line_vat=0 poprawnie).
-- To zawyzalo/zanizalo sumy w podsumowaniu miesiaca (InvoiceMonthSummary) po obu
-- stronach: sprzedazy i kosztow, dla kazdej historycznej faktury EKO.
--
-- Kod naprawiony w src/components/ScreenInvoices.jsx (commit f39b5396) — total_net
-- nie byl dotkniety bugiem (VAT nie wplywa na line_net), wiec zrodlem prawdy jest
-- total_net: dla EKO total_vat musi byc 0, a total_gross = total_net.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

-- Podglad przed zmiana (opcjonalnie odpal najpierw, zeby zobaczyc skale problemu):
-- select id, number, doc_type, direction, total_net, total_vat, total_gross
-- from invoices
-- where doc_type = 'eko' and (total_vat <> 0 or total_gross <> total_net)
-- order by issue_date desc;

update invoices
set total_vat = 0,
    total_gross = total_net,
    updated_at = now()
where doc_type = 'eko'
  and (total_vat <> 0 or total_gross <> total_net);
