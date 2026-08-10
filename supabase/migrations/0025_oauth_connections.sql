-- OAuth connections for provider refresh tokens.
-- Tokens are ciphertext only; plaintext is never written to Supabase.
create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid,
  provider text not null check (provider in ('google', 'microsoft')),
  provider_account_id text not null,
  provider_email text,
  scopes text not null default '',
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);

create table if not exists public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid,
  provider text not null check (provider in ('google', 'microsoft')),
  code_verifier text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.oauth_connections enable row level security;
alter table public.oauth_states enable row level security;

create policy oauth_connections_owner on public.oauth_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy oauth_states_owner on public.oauth_states
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists oauth_connections_user_provider_idx
  on public.oauth_connections(user_id, provider);
create index if not exists oauth_states_expires_idx
  on public.oauth_states(expires_at);
