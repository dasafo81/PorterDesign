-- Demo katalog tkanin (fikcyjny) + stany w magazynie. Uruchom w Supabase SQL Editor.
-- Wpisz e-mail konta demo w 4. linijce i kliknij Run. Dziala tylko na koncie z flaga is_demo.
-- Ceny sa spojne z wycenami z seed_demo.sql (te same nazwy tkanin i ceny brutto za mb).
-- Kasuje tylko wlasne tkaniny katalogu oraz tkaniny/probniki w magazynie tego konta.
do $$
declare
  v_email text := 'WPISZ_EMAIL_KONTA@example.com';
  v_tenant uuid; v_demo boolean; r record; n int := 0;
begin
  select (raw_app_meta_data->>'tenant_id')::uuid into v_tenant from auth.users where lower(email)=lower(v_email);
  if v_tenant is null then raise exception 'Nie znaleziono konta %', v_email; end if;
  select coalesce(is_demo,false) into v_demo from tenants where id=v_tenant;
  if not v_demo then raise exception 'To nie jest konto demo (is_demo=false) - przerywam.'; end if;

  delete from catalog_items where tenant_id=v_tenant and group_id='tkaniny' and base_key is null;
  delete from warehouse_items where tenant_id=v_tenant and category in ('tkanina','probnik');

  for r in
    select * from (values
      -- nazwa, cena brutto/mb, szer. rolki cm, zakup/mb, sklad, gramatura, kurczliwosc %, kolor, mb w magazynie, lokalizacja, [bestseller, welur, basic, thermal, pattern, gloss, polprzezierne, podszewka]
      ('Velvet Sand',        189, 300,  82, '100% poliester',            320, 2.0, 'piaskowy',     38.5, 'Regał A1', true,  true,  false, false, false, false, false, false),
      ('Velvet Navy',        199, 300,  86, '100% poliester',            320, 2.0, 'granatowy',    24.0, 'Regał A1', true,  true,  false, false, false, false, false, false),
      ('Velvet Emerald',     209, 300,  90, '100% poliester',            330, 2.0, 'butelkowa zieleń', 15.5, 'Regał A2', false, true,  false, false, false, false, false, false),
      ('Velvet Wine',        219, 300,  94, '100% poliester',            330, 2.0, 'bordowy',       2.5, 'Regał A2', false, true,  false, false, false, false, false, false),
      ('Chenille Taupe',     179, 300,  76, '100% poliester',            380, 1.5, 'taupe',        29.0, 'Regał A3', true,  false, false, false, true,  false, false, false),
      ('Len Natural',        169, 300,  71, '55% len, 45% poliester',    210, 3.0, 'naturalny',    41.0, 'Regał B1', true,  false, true,  false, false, false, true,  false),
      ('Len Stone',          169, 300,  71, '55% len, 45% poliester',    210, 3.0, 'kamienny',     18.0, 'Regał B1', false, false, true,  false, false, false, true,  false),
      ('Voile Ivory',         79, 300,  31, '100% poliester',             60, 1.0, 'ecru',         95.0, 'Regał C1', false, false, true,  false, false, false, true,  false),
      ('Voile White',         75, 300,  29, '100% poliester',             60, 1.0, 'biały',       110.0, 'Regał C1', true,  false, true,  false, false, false, true,  false),
      ('Voile Ecru',          69, 300,  27, '100% poliester',             55, 1.0, 'ecru',         52.0, 'Regał C2', false, false, true,  false, false, false, true,  false),
      ('Blackout Graphite',  149, 280,  58, '100% poliester, powłoka',   340, 1.0, 'grafitowy',    33.0, 'Regał D1', true,  false, false, true,  false, false, false, false),
      ('Blackout Ash',       149, 280,  58, '100% poliester, powłoka',   340, 1.0, 'popielaty',    27.5, 'Regał D1', false, false, false, true,  false, false, false, false),
      ('Blackout Sky',       139, 280,  54, '100% poliester, powłoka',   320, 1.0, 'błękitny',      4.0, 'Regał D2', false, false, false, true,  false, false, false, false)
    ) as t(name, price, width, zakup, comp, gsm, shrink, color, stock, loc, bestseller, welur, basic, thermal, pattern, gloss, polprz, podszewka)
  loop
    insert into catalog_items(tenant_id, group_id, base_key, name, price, height_cm, meta, purchase_price, composition, weight_gsm, shrinkage_pct,
                              bestseller, welur, basic, thermal, pattern, gloss, polprzezierne, podszewka, has_sample)
    values (v_tenant, 'tkaniny', null, r.name, r.price, r.width, 'Tkaniny Demo', r.zakup, r.comp, r.gsm, r.shrink,
            r.bestseller, r.welur, r.basic, r.thermal, r.pattern, r.gloss, r.polprz, r.podszewka, true);

    insert into warehouse_items(tenant_id, category, name, quantity, unit, color, supplier, location, notes)
    values (v_tenant, 'tkanina', r.name, r.stock, 'mb', r.color, 'Tkaniny Demo Sp. z o.o.', r.loc,
            case when r.stock < 5 then 'Niski stan — dozamówić' else 'Dane demonstracyjne (fikcyjne)' end);
    n := n + 1;
  end loop;

  -- kilka probnikow
  insert into warehouse_items(tenant_id, category, name, quantity, unit, supplier, location, notes) values
    (v_tenant, 'probnik', 'Kolekcja Velvet — wzornik', 2, 'szt', 'Tkaniny Demo Sp. z o.o.', 'Szafka próbek', 'Dane demonstracyjne (fikcyjne)'),
    (v_tenant, 'probnik', 'Kolekcja Len & Voile — wzornik', 3, 'szt', 'Tkaniny Demo Sp. z o.o.', 'Szafka próbek', 'Dane demonstracyjne (fikcyjne)'),
    (v_tenant, 'probnik', 'Blackout — wzornik', 1, 'szt', 'Tkaniny Demo Sp. z o.o.', 'Szafka próbek', 'Dane demonstracyjne (fikcyjne)');

  raise notice 'Dodano % tkanin do katalogu i magazynu (+3 wzorniki).', n;
end $$;
