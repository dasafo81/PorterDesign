-- supabase/migrations/0016_fix_direction_ksef_synced.sql
-- Naprawa danych: faktury zakupowe zsynchronizowane z KSeF przed poprawka w ksef-receive
-- (commit 69059da) mialy poprawny doc_type='zakup', ale kolumna direction nie byla
-- ustawiana explicite przy zapisie, wiec przyjmowala domyslna wartosc 'sprzedaz'.
-- invDirection() w UI sprawdza inv.direction PRZED fallbackiem po doc_type, wiec takie
-- faktury pokazywaly sie i liczyly jako sprzedazowe w podsumowaniu.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

update invoices
set direction = 'zakup'
where doc_type = 'zakup' and (direction is null or direction = 'sprzedaz');
