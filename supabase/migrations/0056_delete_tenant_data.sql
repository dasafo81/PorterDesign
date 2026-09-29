-- supabase/migrations/0056_delete_tenant_data.sql
-- Trwale usuwa tenanta razem ze WSZYSTKIMI jego danymi. Wywolywane wylacznie z api/admin/tenants.js
-- (DELETE, tylko super-admin) przez service_role.
--
-- Funkcja sama znajduje wszystkie tabele z kolumna tenant_id w schemacie public (rowniez te
-- utworzone poza migracjami), wiec nie trzeba jej aktualizowac przy dodawaniu nowych tabel.
-- Kolejnosc usuwania nie jest znana z gory (FK bez ON DELETE CASCADE), dlatego tabele, ktore
-- zglosza foreign_key_violation, sa ponawiane w kolejnych przebiegach. Calosc jest jedna
-- transakcja: przy bledzie nic nie zostaje usuniete.
--
-- Nie usuwa: kont w auth.users (robi to endpoint), plikow w Storage, subskrypcji w Stripe.

create or replace function delete_tenant_data(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pending   text[];
  remaining text[];
  t         text;
  n         bigint;
  progress  boolean;
  passes    int := 0;
  counts    jsonb := '{}'::jsonb;
begin
  if p_tenant is null then raise exception 'tenant id required'; end if;
  if not exists (select 1 from tenants where id = p_tenant) then raise exception 'tenant not found'; end if;

  select array_agg(c.table_name::text order by c.table_name) into pending
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
   where c.table_schema = 'public' and c.column_name = 'tenant_id' and c.table_name <> 'tenants';

  loop
    exit when coalesce(array_length(pending, 1), 0) = 0;
    progress := false;
    remaining := '{}';
    foreach t in array pending loop
      begin
        execute format('delete from public.%I where tenant_id::text = $1', t) using p_tenant::text;
        get diagnostics n = row_count;
        if n > 0 then counts := counts || jsonb_build_object(t, coalesce((counts ->> t)::bigint, 0) + n); end if;
        progress := true;
      exception when foreign_key_violation then
        remaining := remaining || t;
      end;
    end loop;
    pending := remaining;
    passes := passes + 1;
    if coalesce(array_length(pending, 1), 0) > 0 and (not progress or passes > 10) then
      raise exception 'nie mozna usunac danych tabel (FK): %', pending;
    end if;
  end loop;

  delete from tenants where id = p_tenant;
  return counts;
end;
$$;

revoke all on function delete_tenant_data(uuid) from public, anon, authenticated;
grant execute on function delete_tenant_data(uuid) to service_role;
