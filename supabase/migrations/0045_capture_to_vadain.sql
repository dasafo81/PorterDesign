-- supabase/migrations/0045_capture_to_vadain.sql
-- ── KATALOG: tkaniny kolekcji Capture → producent Vadain, nazwa "<Tkanina> / Capture" ──
-- Przenosi nadpisania z Katalogu (cena, próbnik, ukrycie itd.) na nowe klucze.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

with map(old_key, new_key, new_name) as (values
  ('tkaniny::Aurora Capture', 'tkaniny::Aurora / Capture', 'Aurora / Capture'),
  ('tkaniny::Euphoria', 'tkaniny::Euphoria / Capture', 'Euphoria / Capture'),
  ('tkaniny::Explore', 'tkaniny::Explore / Capture', 'Explore / Capture'),
  ('tkaniny::Fame', 'tkaniny::Fame / Capture', 'Fame / Capture'),
  ('tkaniny::Glaze', 'tkaniny::Glaze / Capture', 'Glaze / Capture'),
  ('tkaniny::Halo', 'tkaniny::Halo / Capture', 'Halo / Capture'),
  ('tkaniny::Lucente Capture', 'tkaniny::Lucente / Capture', 'Lucente / Capture'),
  ('tkaniny::Lumière', 'tkaniny::Lumière / Capture', 'Lumière / Capture'),
  ('tkaniny::Moire', 'tkaniny::Moire / Capture', 'Moire / Capture'),
  ('tkaniny::Rumour', 'tkaniny::Rumour / Capture', 'Rumour / Capture'),
  ('tkaniny::Sign', 'tkaniny::Sign / Capture', 'Sign / Capture'),
  ('tkaniny::Thread', 'tkaniny::Thread / Capture', 'Thread / Capture'),
  ('tkaniny::Tomorrow', 'tkaniny::Tomorrow / Capture', 'Tomorrow / Capture'),
  ('tkaniny::Ultimate', 'tkaniny::Ultimate / Capture', 'Ultimate / Capture')
)
update catalog_items c
set base_key = map.new_key,
    name     = map.new_name,
    meta     = case when c.meta is null or c.meta = '' or c.meta = 'Capture' then 'Vadain' else c.meta end
from map
where c.base_key = map.old_key
  and not exists (select 1 from catalog_items x where x.base_key = map.new_key);

-- tkaniny własne wpisane ręcznie z producentem "Capture"
update catalog_items set meta = 'Vadain' where group_id = 'tkaniny' and meta = 'Capture';
