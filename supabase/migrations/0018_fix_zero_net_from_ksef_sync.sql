-- supabase/migrations/0018_fix_zero_net_from_ksef_sync.sql
-- Naprawa danych: bug w ksef-receive (funkcja "Synchronizuj z KSeF") liczyl total_net/
-- total_vat faktury z tagow XML P_13_Razem/P_14_Razem, ktore NIE ISTNIEJA w schemacie
-- FA(3) (kwoty netto/VAT sa tam rozbite per stawka: P_13_1/P_14_1, P_13_2/P_14_2 itd.,
-- nigdy jako jedna zbiorcza suma). xmlVal() zawsze zwracal pusty string -> 0, wiec
-- KAZDA synchronizacja z KSeF zerowala total_net/total_vat, mimo ze total_gross
-- (czytany z P_15, ktory realnie istnieje) zostawal poprawny.
--
-- Kod naprawiony w supabase/functions/ksef-receive/index.ts (commit 10d7434) — liczy
-- teraz total_net/total_vat z sumy rzeczywistych pozycji faktury (invoice_items).
--
-- Ten skrypt przelicza juz zepsute rekordy: total_net=0 mimo total_gross>0, dla faktur
-- ktore maja zapisane pozycje — liczymy total_net/total_vat jako sume line_net/line_vat
-- z invoice_items (to samo zrodlo prawdy, ktorego uzywa teraz naprawiony kod).
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

-- Podglad przed zmiana (opcjonalnie odpal najpierw, zeby zobaczyc skale problemu):
-- select i.id, i.number, i.doc_type, i.direction, i.issue_date,
--        i.total_net, i.total_vat, i.total_gross,
--        (select coalesce(round(sum(line_net)::numeric,2),0) from invoice_items where invoice_id = i.id) as items_net,
--        (select coalesce(round(sum(line_vat)::numeric,2),0) from invoice_items where invoice_id = i.id) as items_vat
-- from invoices i
-- where i.total_net = 0 and i.total_gross <> 0
-- order by i.issue_date desc;

with sums as (
  select invoice_id,
         round(sum(line_net)::numeric, 2) as net_sum,
         round(sum(line_vat)::numeric, 2) as vat_sum
  from invoice_items
  group by invoice_id
)
update invoices i
set total_net = s.net_sum,
    total_vat = s.vat_sum,
    updated_at = now()
from sums s
where i.id = s.invoice_id
  and i.total_net = 0
  and i.total_gross <> 0
  and s.net_sum <> 0;

-- Kontrola po naprawie: powinno zwrocic 0 wierszy (lub tylko faktury bez pozycji,
-- ktorych nie da sie naprawic tym sposobem — do recznego sprawdzenia).
-- select id, number, doc_type, direction, issue_date, total_net, total_gross
-- from invoices
-- where total_net = 0 and total_gross <> 0
-- order by issue_date desc;
