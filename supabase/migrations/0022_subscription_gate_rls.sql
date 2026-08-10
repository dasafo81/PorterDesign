-- Backendowy gate abonamentowy.
--
-- RLS tenant isolation alone nie wystarcza: po wygaśnięciu triala klient
-- nadal mógłby wywoływać PostgREST bezpośrednio. Ta funkcja jest używana jako
-- RESTRICTIVE policy, więc musi przejść razem z istniejącymi politykami
-- tenantowymi (policies permissive są łączone przez OR).

-- W starszych środowiskach kolumna demo nie była obecna w migracjach repo,
-- choć produkcyjny frontend już ją odczytuje.
alter table public.tenants
  add column if not exists is_demo boolean not null default false;

create or replace function public.pd_subscription_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Super-admin jest operatorem systemu, nie klientem abonamentowym.
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

comment on function public.pd_subscription_active() is
  'Backend subscription gate: active subscription, valid trial, demo or super-admin.';

revoke all on function public.pd_subscription_active() from public;
grant execute on function public.pd_subscription_active() to authenticated;

-- Restrictive policy działa jako dodatkowy warunek AND. Pomijamy tenants:
-- użytkownik musi móc odczytać własny status, aby UI mogło pokazać paywall.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as table_name, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'tenants'
      and exists (
        select 1
        from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'tenant_id'
          and not a.attisdropped
      )
  loop
    execute format('alter table %s enable row level security', r.table_name);
    execute format('drop policy if exists subscription_gate on %s', r.table_name);
    execute format(
      'create policy subscription_gate on %s as restrictive for all to authenticated using (public.pd_subscription_active()) with check (public.pd_subscription_active())',
      r.table_name
    );
  end loop;
end $$;
