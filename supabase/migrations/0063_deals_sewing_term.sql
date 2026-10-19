-- 0063: termin realizacji zlecenia szycia na dealu
-- Zapisywany automatycznie po wysłaniu zlecenia mailem z Podsumowania (razem ze szwalnią i datą wysyłki).
-- Kolumny szwalni/daty dodane z "if not exists" na wypadek, gdyby nie istniały jeszcze w bazie.

alter table public.deals
  add column if not exists sewing_house     text,
  add column if not exists sewing_sent_date date,
  add column if not exists sewing_term      text;

comment on column public.deals.sewing_term is 'Termin realizacji zlecenia szycia (tekst, jak wpisany w zleceniu)';
