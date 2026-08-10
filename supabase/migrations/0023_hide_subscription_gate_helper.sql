-- Helper używany wyłącznie przez RLS. Nie publikujemy go jako endpointu RPC.
create schema if not exists private;

create or replace function private.pd_subscription_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
    or exists (
      select 1
      from public.tenants t
      where t.id = nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
        and (
          coalesce(t.is_demo, false)
          or t.subscription_status = 'active'
          or (
            t.subscription_status = 'trialing'
            and (t.trial_ends_at is null or t.trial_ends_at > now())
          )
        )
    );
$$;

revoke all on function private.pd_subscription_active() from public;
grant usage on schema private to authenticated;
grant execute on function private.pd_subscription_active() to authenticated;

-- Przełącz istniejące restrictive policies na funkcję w nieeksponowanym schema.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'tenants'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'tenant_id'
          and not a.attisdropped
      )
  loop
    execute format('drop policy if exists subscription_gate on %s', r.table_name);
    execute format(
      'create policy subscription_gate on %s as restrictive for all to authenticated using (private.pd_subscription_active()) with check (private.pd_subscription_active())',
      r.table_name
    );
  end loop;
end $$;

drop function if exists public.pd_subscription_active();
