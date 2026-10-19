-- Czas trwania terminów dealu (minuty). Terminy mają dotąd tylko początek,
-- więc kalendarz rysował każdy blok jako 1 h niezależnie od godziny „DO”.
alter table deals
  add column if not exists visit_duration_min     integer,
  add column if not exists delivery_duration_min  integer,
  add column if not exists delivery2_duration_min integer,
  add column if not exists followup_duration_min  integer;
