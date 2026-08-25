-- 0040b_snapshots_recovery.sql
-- Zapytania ratunkowe do client_snapshots. NIE jest to migracja -- to zestaw
-- gotowcow do wklejenia w SQL Editor, gdy trzeba cofnac zmiane u konkretnego klienta.
-- (Do czasu, az powstanie UI "Historia wersji" w karcie klienta.)

-- ── A. Znajdz klienta po nazwisku ─────────────────────────────────────────────
select id, name, updated_at, private.pd_count_products(rooms) as produkty
from clients
where name ilike '%Zarzecki%'
order by updated_at desc;

-- ── B. Lista wersji danego klienta (podstaw ID z kroku A) ─────────────────────
select id, created_at, product_count, changed_by
from client_snapshots
where client_id = 123
order by created_at desc;

-- ── C. Podglad konkretnej wersji przed przywroceniem ──────────────────────────
select
  s.created_at,
  s.product_count                                as produkty_w_wersji,
  private.pd_count_products(c.rooms)             as produkty_teraz,
  jsonb_array_length(s.snapshot->'rooms')        as pomieszczen_w_wersji
from client_snapshots s
join clients c on c.id = s.client_id
where s.id = 456;

-- ── D. PRZYWROCENIE wersji (podstaw ID snapshotu z kroku B) ───────────────────
-- Sam UPDATE tez odpali trigger, wiec aktualny (zly) stan trafi do historii
-- jako nowa wersja -- przywrocenie jest odwracalne.
update clients c
set rooms            = s.snapshot->'rooms',
    name             = coalesce(s.snapshot->>'name', c.name),
    commission       = s.snapshot->>'commission',
    install_fee      = s.snapshot->>'install_fee',
    install_fee_mode = coalesce(s.snapshot->>'install_fee_mode','percent'),
    updated_at       = now()
from client_snapshots s
where s.id = 456
  and c.id = s.client_id;

-- ── E. Przywrocenie TYLKO jednego pomieszczenia ───────────────────────────────
-- Gdy reszta biezacych danych jest dobra i chodzi o jeden pokoj z wersji.
-- Podmien 'Salon' na nazwe pomieszczenia.
update clients c
set rooms = (
      select jsonb_agg(
        case when r->>'name' = 'Salon'
          then (select r2 from jsonb_array_elements(s.snapshot->'rooms') r2
                where r2->>'name' = 'Salon' limit 1)
          else r
        end)
      from jsonb_array_elements(c.rooms) r
    ),
    updated_at = now()
from client_snapshots s
where s.id = 456 and c.id = s.client_id;

-- ── F. Kontrola stanu historii ────────────────────────────────────────────────
select client_id, count(*) as wersji, min(created_at) as od, max(created_at) as do
from client_snapshots
group by client_id
order by wersji desc
limit 20;

-- Rozmiar tabeli (gdyby historia zaczela puchnac)
select pg_size_pretty(pg_total_relation_size('client_snapshots'));
