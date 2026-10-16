-- Faktury demo My DecoLab (fikcyjne). Uruchom w Supabase SQL Editor PO supabase/seed_demo.sql
-- (potrzebuje klientow z tamtego skryptu). Wpisz e-mail konta demo w linii 4 i kliknij Run.
-- Kasuje tylko faktury tego konta i dziala wylacznie na koncie z flaga is_demo.
do $$
declare
  v_email text := 'WPISZ_EMAIL_KONTA@example.com';
  v_tenant uuid; v_demo boolean; v_name text; v_inv uuid; v_i int := 0;
  r record; c record; it jsonb;
  v_net numeric; v_vat numeric; v_gross numeric; v_line numeric; v_issue date; v_paid numeric;
begin
  select (raw_app_meta_data->>'tenant_id')::uuid into v_tenant from auth.users where lower(email)=lower(v_email);
  if v_tenant is null then raise exception 'Nie znaleziono konta %', v_email; end if;
  select coalesce(is_demo,false), name into v_demo, v_name from tenants where id=v_tenant;
  if not v_demo then raise exception 'To nie jest konto demo (is_demo=false) - przerywam.'; end if;

  -- dane sprzedawcy (fikcyjne)
  insert into invoice_settings(tenant_id,seller_name,seller_nip,seller_address,seller_postal,seller_city,seller_email,seller_phone,seller_bank)
  values (v_tenant, v_name, '5260250995', 'ul. Przykładowa 10', '00-001', 'Warszawa', v_email, '500 000 000', 'PL61109010140000071219812874')
  on conflict (tenant_id) do update set seller_name=excluded.seller_name, seller_nip=excluded.seller_nip,
    seller_address=excluded.seller_address, seller_postal=excluded.seller_postal, seller_city=excluded.seller_city,
    seller_email=excluded.seller_email, seller_phone=excluded.seller_phone, seller_bank=excluded.seller_bank;
  if not exists (select 1 from entities where tenant_id=v_tenant and is_default) then
    insert into entities(tenant_id,name,nip,address,postal,city,email,phone,bank,is_default,sort_order)
    values (v_tenant, v_name, '5260250995', 'ul. Przykładowa 10', '00-001', 'Warszawa', v_email, '500 000 000', 'PL61109010140000071219812874', true, 0);
  end if;

  delete from invoice_items where tenant_id=v_tenant;
  delete from invoices where tenant_id=v_tenant;

  for r in
    select * from (values
      ('Piotr Kowalczyk',            'vat',     -48, 14, 'paid',    '[{"n":"Zasłony velvet – salon","q":1,"u":"kpl","p":4930},{"n":"Karnisz podwójny 5 m","q":1,"u":"szt","p":520},{"n":"Montaż","q":1,"u":"usł","p":480}]'::jsonb),
      ('Joanna Lewandowska',         'vat',     -30, 14, 'paid',    '[{"n":"Zasłony i firany – salon","q":1,"u":"kpl","p":3350},{"n":"Zasłony blackout – sypialnia","q":1,"u":"kpl","p":1650},{"n":"Żaluzje – kuchnia","q":1,"u":"szt","p":250}]'::jsonb),
      ('Agnieszka Kamińska',         'vat',     -21, 14, 'paid',    '[{"n":"Zasłony lniane – salon","q":1,"u":"kpl","p":1900},{"n":"Żaluzje aluminiowe – gabinet","q":1,"u":"szt","p":300},{"n":"Montaż","q":1,"u":"usł","p":260}]'::jsonb),
      ('Ilona Pawlak',               'vat',     -18, 14, 'unpaid',  '[{"n":"Zasłona blackout – sypialnia","q":1,"u":"szt","p":1100},{"n":"Żaluzja aluminiowa","q":1,"u":"szt","p":200},{"n":"Montaż","q":1,"u":"usł","p":180}]'::jsonb),
      ('Anna i Marcin Wiśniewscy',   'zaliczka', -10,  7, 'paid',    '[{"n":"Zaliczka 50% – zasłony i firany (salon, sypialnia)","q":1,"u":"usł","p":3370}]'::jsonb),
      ('Robert i Ewa Dąbrowscy',     'zaliczka',  -6,  7, 'partial',  '[{"n":"Zaliczka 50% – salon z wykuszem i sypialnia","q":1,"u":"usł","p":3660}]'::jsonb),
      ('Katarzyna Zielińska',        'proforma',  -5, 14, 'unpaid',  '[{"n":"Zasłony lniane + firana – salon","q":1,"u":"kpl","p":2700},{"n":"Żaluzje – gabinet","q":2,"u":"szt","p":330},{"n":"Montaż","q":1,"u":"usł","p":650}]'::jsonb),
      ('Hotel Pod Lipami (kontrahent B2B)', 'vat', -4, 30, 'unpaid', '[{"n":"Zasłony blackout – pokoje Deluxe","q":6,"u":"kpl","p":1280},{"n":"Żaluzje aluminiowe – pokoje","q":6,"u":"szt","p":210},{"n":"Zasłony i firany – restauracja","q":1,"u":"kpl","p":3150}]'::jsonb),
      ('Magdalena Szymańska',        'proforma',  -2, 14, 'unpaid',  '[{"n":"Zasłony chenille + firana – salon","q":1,"u":"kpl","p":3300},{"n":"Zasłony – jadalnia","q":1,"u":"szt","p":1150}]'::jsonb)
    ) as t(cname, dtype, issue_off, due_days, pstat, items)
  loop
    select * into c from clients where tenant_id=v_tenant and name=r.cname limit 1;
    if c.id is null then raise notice 'Pominieto - brak klienta %', r.cname; continue; end if;
    v_i := v_i + 1;
    v_issue := current_date + r.issue_off;
    v_net := 0;
    for it in select * from jsonb_array_elements(r.items) loop
      v_net := v_net + (it->>'q')::numeric * (it->>'p')::numeric;
    end loop;
    v_vat := round(v_net*0.23,2); v_gross := v_net + v_vat;
    v_paid := case r.pstat when 'paid' then v_gross when 'partial' then round(v_gross*0.5,2) else 0 end;

    insert into invoices(tenant_id,number,doc_type,direction,status,issue_date,sale_date,due_date,payment_method,payment_status,paid_amount,
      buyer_name,buyer_nip,buyer_address,buyer_postal,buyer_city,buyer_email,client_id,seller_snapshot,
      total_net,total_vat,total_gross,currency,notes,ksef_status)
    values (v_tenant,
      case r.dtype when 'proforma' then 'PF/' else 'FV/' end || v_i || '/' || to_char(v_issue,'MM') || '/' || to_char(v_issue,'YYYY'),
      r.dtype,'sprzedaz', case when r.pstat='unpaid' and r.dtype='proforma' then 'issued' else 'sent' end,
      v_issue, v_issue, v_issue + r.due_days, 'przelew', r.pstat, v_paid,
      c.name, case when c.name like 'Hotel%' then '1234563218' else '' end, coalesce(c.addr,''), coalesce(c.postal,''), coalesce(c.city,''), coalesce(c.email,''), c.id,
      jsonb_build_object('name',v_name,'nip','5260250995','address','ul. Przykładowa 10','postal','00-001','city','Warszawa','email',v_email,'bank','PL61109010140000071219812874'),
      v_net, v_vat, v_gross, 'PLN', 'Dane demonstracyjne (fikcyjne).', 'none')
    returning id into v_inv;

    for it in select * from jsonb_array_elements(r.items) loop
      v_line := (it->>'q')::numeric * (it->>'p')::numeric;
      insert into invoice_items(tenant_id,invoice_id,position,name,quantity,unit,unit_net,vat_rate,line_net,line_vat,line_gross)
      values (v_tenant, v_inv, 1 + (select count(*) from invoice_items where invoice_id=v_inv), it->>'n', (it->>'q')::numeric, it->>'u', (it->>'p')::numeric, 23,
        v_line, round(v_line*0.23,2), v_line + round(v_line*0.23,2));
    end loop;
  end loop;
  raise notice 'Dodano % faktur demo.', v_i;
end $$;
