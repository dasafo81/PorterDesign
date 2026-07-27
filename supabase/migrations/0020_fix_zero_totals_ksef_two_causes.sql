-- supabase/migrations/0020_fix_zero_totals_ksef_two_causes.sql
-- Naprawa danych — kontynuacja zgloszenia "faktury z kwota 0 zl" (2026-07-27).
-- Kontrola z migracji 0019 pokazala DWIE oddzielne przyczyny w tej samej grupie faktur:
--
-- (A) 7 faktur ma poprawne, niezerowe invoice_items (sumy sie zgadzaja z XML), ale
--     naglowek (total_net/total_vat/total_gross) jest zerowy. To slad STAREGO buga
--     (P_13_Razem/P_14_Razem nie istnieja w schemacie FA(3) -> zawsze 0), ktory zostal
--     naprawiony w kodzie (commit 10d7434) duzo wczesniej, ale te konkretne faktury
--     zostaly zsynchronizowane, zanim poprawka faktycznie trafila na produkcje (funkcje
--     Edge wymagaja recznego redeploy w Supabase Dashboard — nie wdrazaja sie same z pusha
--     do GitHub). Naprawa: przeliczyc naglowek z sumy invoice_items (ktore sa juz poprawne).
--
-- (B) 1 faktura (24834/8005/2026) ma ZEROWE invoice_items w bazie, bo dostawca zapisal
--     pozycje w wariancie BRUTTO (P_9B/P_11A/P_11Vat), ktorego parser wczesniej nie
--     obslugiwal (czytal tylko P_9A/P_11 = netto). Kod naprawiony w
--     supabase/functions/ksef-receive/index.ts (commit 1ef91fb). Poniewaz synchronizacja
--     pomija faktury, ktore "wygladaja na kompletne" (maja juz XML i jakiekolwiek pozycje,
--     nawet zerowe), samo kliknieciem "Synchronizuj z KSeF" jej nie naprawi — trzeba
--     usunac jej biezace (zerowe) pozycje, zeby nastepny sync potraktowal ja jako niekompletna
--     i odtworzyl pozycje ze ZAPISANEGO XML (bez ponownego odpytywania KSeF) poprawionym
--     parserem. Sciezka naprawy w kodzie zostala tez poprawiona (commit 7d3f590), zeby przy
--     tej okazji przeliczala rowniez naglowek faktury, nie tylko invoice_items.
--
-- WYMAGANE PO TEJ MIGRACJI: zredeployowac ksef-receive w Supabase Dashboard, a nastepnie
-- w aplikacji kliknac "Synchronizuj z KSeF" (dowolny zakres dat obejmujacy okres synchronizacji
-- — sama synchronizacja odtworzy pozycje faktury 24834/8005/2026 z jej zapisanego XML).
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

-- ── (A) Przelicz naglowek z sumy invoice_items dla faktur, ktore maja poprawne pozycje,
-- ale zerowy naglowek — nie ograniczamy do konkretnych 8 id, zeby zlapac ewentualne inne
-- faktury dotkniete tym samym starym bugiem.
with sums as (
  select invoice_id,
         round(sum(line_net)::numeric, 2)   as net_sum,
         round(sum(line_vat)::numeric, 2)   as vat_sum,
         round(sum(line_gross)::numeric, 2) as gross_sum
  from invoice_items
  group by invoice_id
)
update invoices i
set total_net   = s.net_sum,
    total_vat   = s.vat_sum,
    total_gross = s.gross_sum,
    updated_at  = now()
from sums s
where i.id = s.invoice_id
  and i.total_net = 0
  and i.total_gross = 0
  and s.net_sum <> 0;

-- ── (B) Usun zerowe pozycje faktury z wariantem brutto (P_9B/P_11A) — zapisany xml_payload
-- zostaje nietkniety, wiec nastepna synchronizacja z KSeF odtworzy poprawne pozycje
-- (i naglowek) poprawionym parserem, bez ponownego pobierania z KSeF.
delete from invoice_items
where invoice_id = '19830f39-d4b3-484e-a366-7dcb179f438d';

-- ── Kontrola po (A): powinno pokazac 0 wierszy (albo tylko faktury, ktore SA
-- faktycznie zerowe w invoice_items — do osobnego sprawdzenia, nie objete ta migracja).
-- select id, number, total_net, total_gross
-- from invoices
-- where total_net = 0 and total_gross = 0
-- order by issue_date desc;

-- ── Kontrola po (B) — PO redeployu funkcji i kliknieciu "Synchronizuj z KSeF" w aplikacji:
-- select id, number, total_net, total_gross,
--        (select count(*) from invoice_items where invoice_id = invoices.id) as items_count
-- from invoices
-- where id = '19830f39-d4b3-484e-a366-7dcb179f438d';
