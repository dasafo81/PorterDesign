-- supabase/migrations/0020_kasowa_backfill_rollback.sql
-- Czesciowe cofniecie backfillu z migracji 0019.
--
-- 0019 ustawilo invoices.kasowa = true na WSZYSTKICH historycznych fakturach
-- sprzedazowych tenanta PD Porter Design. Dla faktur juz potwierdzonych w KSeF
-- tworzy to rozjazd w druga strone: PDF generowany z aplikacji drukuje napis
-- "Metoda Kasowa", podczas gdy XML lezacy w KSeF deklaruje <P_16>2</P_16>.
-- Faktury w KSeF sa niezmienne, wiec PDF musi wiernie odwzorowywac to,
-- co faktycznie zostalo wyslane — inaczej dokument w aplikacji i dokument
-- w rejestrze MF mowia co innego.
--
-- Cofamy flage WYLACZNIE tam, gdzie wyslany XML deklaruje P_16 = 2.
-- Faktury jeszcze niewyslane (draft/issued bez potwierdzenia KSeF) zostaja
-- z kasowa = true i pojda do KSeF juz poprawnie, z P_16 = 1.
--
-- Uruchom w Supabase SQL Editor (rkcidwusjzvfwxszotnb).

update invoices
set kasowa = false
where tenant_id = 'a0000000-0000-4000-8000-000000000001'
  and coalesce(direction, 'sprzedaz') = 'sprzedaz'
  and ksef_status = 'confirmed'
  and xml_payload like '%<P_16>2</P_16>%'
  and coalesce(kasowa, false) = true;
