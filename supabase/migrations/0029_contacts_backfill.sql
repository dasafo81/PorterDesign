-- supabase/migrations/0029_contacts_backfill.sql
-- Faza 4: jednorazowy backfill dotychczasowych klientów (Wyceny) i nabywców/sprzedawców
-- (Faktury) do bazy Kontrahentów (tabela contacts, migracja 0028).
--
-- Zasada dopasowania: NIP w pierwszej kolejności (min. 10 cyfr po normalizacji),
-- w przeciwnym razie znormalizowana nazwa (+ telefon dla Wycen, które nie mają NIP).
-- Rekordy z pustą lub placeholderową nazwą ("Nowy klient", "Nowy klient AI", "Klient")
-- są CELOWO POMIJANE, żeby nie skleić wielu różnych osób w jednego kontrahenta —
-- zostają bez contact_id do ręcznego uzupełnienia przez Paulinę.
--
-- Nic nie ginie: buyer_*/seller_snapshot na fakturach (wymóg KSeF) zostają nietknięte,
-- ustawiany jest wyłącznie contact_id jako referencja.
--
-- BEZPIECZNE DO PONOWNEGO URUCHOMIENIA: każdy krok operuje tylko na wierszach
-- z contact_id IS NULL, więc powtórne uruchomienie dotknie tylko nowych rekordów.
--
-- Zalecenie: uruchom najpierw sam blok "KONTROLA PRZED" (można osobno, jest read-only),
-- potem cały skrypt, na końcu przejrzyj "KONTROLA PO" — szczególnie listę kontrahentów
-- dopasowanych wyłącznie po nazwie (bez NIP), bo ta sama nazwa może należeć do różnych osób.
--
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

begin;

-- ── KONTROLA PRZED ────────────────────────────────────────────────────────
select
  (select count(*) from clients
     where contact_id is null and trim(name) <> ''
       and lower(trim(name)) not in ('nowy klient','nowy klient ai','klient'))                 as wyceny_do_backfillu,
  (select count(*) from clients
     where contact_id is null and (trim(name) = '' or lower(trim(name)) in ('nowy klient','nowy klient ai','klient'))) as wyceny_pomijane_placeholder,
  (select count(*) from invoices
     where contact_id is null and coalesce(direction,'sprzedaz')='sprzedaz' and trim(buyer_name) <> '')               as faktury_sprzedaz_do_backfillu,
  (select count(*) from invoices
     where contact_id is null and direction='zakup' and trim(coalesce(seller_snapshot->>'name','')) <> '')            as faktury_zakup_do_backfillu;

-- ── Pomocnicze funkcje normalizujące (usuwane na końcu skryptu) ─────────────
create or replace function pd_norm_phone(p text) returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 9), '')
$$;
create or replace function pd_norm_nip(n text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(n,''), '\D', '', 'g')) >= 10
              then regexp_replace(coalesce(n,''), '\D', '', 'g') end
$$;
create or replace function pd_is_company(n text) returns boolean language sql immutable as $$
  select coalesce(n,'') ~* '(sp\.|s\.c\.|z\s?o\.?o|s\.a\.|firma|studio|salon|fhu|p\.h\.u|gastronom|hotel|restaurac)'
$$;

-- ══ 1) WYCENY (clients) → kontrahenci, rola 'klient' ════════════════════════
-- Brak NIP w tabeli clients, więc dopasowanie po nazwie + telefonie (jeśli oba są znane).

update clients c
set contact_id = m.id
from contacts m
where c.contact_id is null
  and trim(c.name) <> '' and lower(trim(c.name)) not in ('nowy klient','nowy klient ai','klient')
  and m.tenant_id = c.tenant_id
  and lower(trim(m.name)) = lower(trim(c.name))
  and (pd_norm_phone(m.phone) is null or pd_norm_phone(c.phone) is null or pd_norm_phone(m.phone) = pd_norm_phone(c.phone));

insert into contacts (tenant_id, kind, role, name, street, postal, city, email, phone)
select distinct on (c.tenant_id, lower(trim(c.name)), coalesce(pd_norm_phone(c.phone),''))
  c.tenant_id,
  case when pd_is_company(c.name) then 'firma' else 'osoba' end,
  'klient', trim(c.name), coalesce(c.addr,''), coalesce(c.postal,''), coalesce(c.city,''), coalesce(c.email,''), coalesce(c.phone,'')
from clients c
where c.contact_id is null
  and trim(c.name) <> '' and lower(trim(c.name)) not in ('nowy klient','nowy klient ai','klient')
order by c.tenant_id, lower(trim(c.name)), coalesce(pd_norm_phone(c.phone),''), c.id;

update clients c
set contact_id = m.id
from contacts m
where c.contact_id is null
  and trim(c.name) <> '' and lower(trim(c.name)) not in ('nowy klient','nowy klient ai','klient')
  and m.tenant_id = c.tenant_id
  and lower(trim(m.name)) = lower(trim(c.name))
  and (pd_norm_phone(m.phone) is null or pd_norm_phone(c.phone) is null or pd_norm_phone(m.phone) = pd_norm_phone(c.phone));

-- ══ 2) FAKTURY SPRZEDAŻOWE (buyer_*) → kontrahenci, rola 'klient' ═══════════

update invoices i
set contact_id = m.id
from contacts m
where i.contact_id is null
  and coalesce(i.direction,'sprzedaz') = 'sprzedaz' and trim(i.buyer_name) <> ''
  and m.tenant_id = i.tenant_id
  and (
    (pd_norm_nip(i.buyer_nip) is not null and pd_norm_nip(m.nip) = pd_norm_nip(i.buyer_nip))
    or lower(trim(m.name)) = lower(trim(i.buyer_name))
  );

insert into contacts (tenant_id, kind, role, name, nip, street, postal, city, email)
select distinct on (i.tenant_id, coalesce(pd_norm_nip(i.buyer_nip), lower(trim(i.buyer_name))))
  i.tenant_id,
  case when pd_is_company(i.buyer_name) then 'firma' else 'osoba' end,
  'klient', trim(i.buyer_name), coalesce(pd_norm_nip(i.buyer_nip),''),
  coalesce(i.buyer_address,''), coalesce(i.buyer_postal,''), coalesce(i.buyer_city,''), coalesce(i.buyer_email,'')
from invoices i
where i.contact_id is null
  and coalesce(i.direction,'sprzedaz') = 'sprzedaz' and trim(i.buyer_name) <> ''
order by i.tenant_id, coalesce(pd_norm_nip(i.buyer_nip), lower(trim(i.buyer_name))), i.created_at;

update invoices i
set contact_id = m.id
from contacts m
where i.contact_id is null
  and coalesce(i.direction,'sprzedaz') = 'sprzedaz' and trim(i.buyer_name) <> ''
  and m.tenant_id = i.tenant_id
  and (
    (pd_norm_nip(i.buyer_nip) is not null and pd_norm_nip(m.nip) = pd_norm_nip(i.buyer_nip))
    or lower(trim(m.name)) = lower(trim(i.buyer_name))
  );

-- ══ 3) FAKTURY ZAKUPOWE (seller_snapshot) → kontrahenci, rola 'dostawca' ════
-- Dla direction='zakup' prawdziwy kontrahent (dostawca) leży w seller_snapshot,
-- nie w buyer_* (tam jest zamrożony Porter Design jako nabywca).

update invoices i
set contact_id = m.id
from contacts m
where i.contact_id is null
  and i.direction = 'zakup' and trim(coalesce(i.seller_snapshot->>'name','')) <> ''
  and m.tenant_id = i.tenant_id
  and (
    (pd_norm_nip(i.seller_snapshot->>'nip') is not null and pd_norm_nip(m.nip) = pd_norm_nip(i.seller_snapshot->>'nip'))
    or lower(trim(m.name)) = lower(trim(i.seller_snapshot->>'name'))
  );

insert into contacts (tenant_id, kind, role, name, nip, street, postal, city, email, phone, bank)
select distinct on (i.tenant_id, coalesce(pd_norm_nip(i.seller_snapshot->>'nip'), lower(trim(i.seller_snapshot->>'name'))))
  i.tenant_id, 'firma', 'dostawca', trim(i.seller_snapshot->>'name'),
  coalesce(pd_norm_nip(i.seller_snapshot->>'nip'),''),
  coalesce(i.seller_snapshot->>'address',''), coalesce(i.seller_snapshot->>'postal',''),
  coalesce(i.seller_snapshot->>'city',''), coalesce(i.seller_snapshot->>'email',''),
  coalesce(i.seller_snapshot->>'phone',''), coalesce(i.seller_snapshot->>'bank','')
from invoices i
where i.contact_id is null
  and i.direction = 'zakup' and trim(coalesce(i.seller_snapshot->>'name','')) <> ''
order by i.tenant_id, coalesce(pd_norm_nip(i.seller_snapshot->>'nip'), lower(trim(i.seller_snapshot->>'name'))), i.created_at;

update invoices i
set contact_id = m.id
from contacts m
where i.contact_id is null
  and i.direction = 'zakup' and trim(coalesce(i.seller_snapshot->>'name','')) <> ''
  and m.tenant_id = i.tenant_id
  and (
    (pd_norm_nip(i.seller_snapshot->>'nip') is not null and pd_norm_nip(m.nip) = pd_norm_nip(i.seller_snapshot->>'nip'))
    or lower(trim(m.name)) = lower(trim(i.seller_snapshot->>'name'))
  );

-- ══ 4) Podmiot występujący i po stronie klienta, i dostawcy → rola 'oba' ════
update contacts m
set role = 'oba', updated_at = now()
where m.role <> 'oba'
  and exists (select 1 from invoices i where i.contact_id = m.id and i.direction = 'zakup')
  and (
    exists (select 1 from clients c where c.contact_id = m.id)
    or exists (select 1 from invoices i2 where i2.contact_id = m.id and coalesce(i2.direction,'sprzedaz') = 'sprzedaz')
  );

drop function pd_norm_phone(text);
drop function pd_norm_nip(text);
drop function pd_is_company(text);

-- ── KONTROLA PO ──────────────────────────────────────────────────────────
select
  (select count(*) from contacts)                                          as kontrahenci_total,
  (select count(*) from contacts where role='oba')                        as kontrahenci_oba,
  (select count(*) from clients where contact_id is not null)             as wyceny_polaczone,
  (select count(*) from clients where contact_id is null and trim(name)<>'' and lower(trim(name)) not in ('nowy klient','nowy klient ai','klient')) as wyceny_niepolaczone_do_sprawdzenia,
  (select count(*) from invoices where contact_id is not null)            as faktury_polaczone;

-- Kontrahenci dopasowani/utworzeni WYŁĄCZNIE po nazwie (brak NIP) i mający więcej niż
-- jedno powiązanie — warto rzucić okiem, bo ta sama nazwa może należeć do różnych osób.
select m.id, m.name, m.phone,
       count(distinct c.id) as liczba_wycen,
       count(distinct i.id) as liczba_faktur
from contacts m
left join clients c on c.contact_id = m.id
left join invoices i on i.contact_id = m.id
where m.nip = ''
group by m.id, m.name, m.phone
having count(distinct c.id) + count(distinct i.id) > 1
order by liczba_wycen + liczba_faktur desc;

commit;
