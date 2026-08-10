-- Atomic per-user AI quota. The API calls this through a service-role-only RPC.
create table if not exists public.ai_usage_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid,
  window_start timestamptz not null,
  request_count integer not null default 0,
  token_budget integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, window_start)
);

alter table public.ai_usage_windows enable row level security;
revoke all on public.ai_usage_windows from anon, authenticated;

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_tenant_id uuid,
  p_max_requests integer default 60,
  p_max_tokens integer default 180000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_row ai_usage_windows%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;
  insert into public.ai_usage_windows(user_id, tenant_id, window_start, request_count, token_budget)
    values (p_user_id, p_tenant_id, v_window, 1, 0)
  on conflict (user_id, window_start) do update
    set request_count = ai_usage_windows.request_count + 1,
        updated_at = now()
  returning * into v_row;
  if v_row.request_count > p_max_requests then
    return jsonb_build_object('allowed', false, 'requests', v_row.request_count, 'limit', p_max_requests);
  end if;
  return jsonb_build_object('allowed', true, 'requests', v_row.request_count, 'limit', p_max_requests);
end;
$$;

revoke all on function public.consume_ai_quota(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, uuid, integer, integer) to service_role;
