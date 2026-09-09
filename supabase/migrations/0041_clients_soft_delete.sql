-- 0041_clients_soft_delete.sql
-- Kosz klientow: usuniecie przestaje byc nieodwracalne.
--
-- Po co: do 2026-09-09 sbApi.deleteClient robil twardy DELETE. Klient znikal
-- z bazy, a razem z nim szly KASKADA powiazane rekordy \u2014 w tym deal z CRM,
-- ktorego nie chroni historia wersji (client_snapshots dotyczy tylko `rooms`).
-- Przypadkowe klikniecie x na liscie kosztowalo dane nie do odzyskania.
-- (Incydent 2026-09-09: Malgorzata Tomaszewska \u2014 wycene odtworzylismy ze
-- snapshotu, ale deal, notatki i daty wizyt przepadly bezpowrotnie.)
--
-- Zmiana jest ADDYTYWNA: jedna kolumna, zaden istniejacy wiersz nie jest ruszany.
-- Uruchom w SQL Editor:
-- https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

-- \u2500\u2500 1. KOLUMNA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
alter table clients add column if not exists deleted_at timestamptz;

-- Indeks czesciowy: lista klientow filtruje po deleted_at is null przy kazdym
-- ladowaniu aplikacji, wiec ten warunek musi byc tani.
create index if not exists clients_active_idx
  on clients (tenant_id, id desc)
  where deleted_at is null;

-- \u2500\u2500 2. WERYFIKACJA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
-- Wszyscy istniejacy klienci maja deleted_at = null, czyli sa aktywni.
select count(*) filter (where deleted_at is null)     as aktywni,
       count(*) filter (where deleted_at is not null) as w_koszu
from clients;


-- \u2500\u2500 3. OBSLUGA KOSZA Z SQL (gdyby UI byl niedostepny) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

-- Co jest w koszu:
-- select id, name, deleted_at, private.pd_count_products(rooms) as produkty
-- from clients where deleted_at is not null order by deleted_at desc;

-- Przywrocenie:
-- update clients set deleted_at = null where id = 167;

-- Usuniecie trwale (NIEODWRACALNE \u2014 kaskada zabierze deale i historie):
-- delete from clients where id = 167 and deleted_at is not null;


-- \u2500\u2500 4. CZYSZCZENIE KOSZA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
-- SWIADOMIE bez automatycznego kasowania po 30 dniach. Cron, ktory sam usuwa
-- dane, to dokladnie ten rodzaj mechanizmu, ktory dzis nas ugryzl \u2014 a kosz
-- z kilkunastoma wpisami niczemu nie przeszkadza. Gdy urosnie, przejrzyj recznie:
--
-- select id, name, deleted_at from clients
-- where deleted_at < now() - interval '30 days' order by deleted_at;
