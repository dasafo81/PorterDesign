-- Wewnętrzna nazwa wyceny (np. "tkaniny", "karnisze") do odróżniania kilku wycen
-- jednego klienta. Widoczna tylko na liście wycen i karcie klienta w aplikacji;
-- nie trafia do PDF-ów, maili, faktur ani CRM.
alter table public.clients add column if not exists quote_label text;
