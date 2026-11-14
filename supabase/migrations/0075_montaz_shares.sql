-- 0075: publiczny link „Do montażu” dla montażysty
-- Jeden wiersz = jeden deal. `payload` to snapshot listy montażowej (pozycje, wymiary, uwagi,
-- plan cięcia szyn KS — BEZ cen), odświeżany przy każdym dodaniu terminu do kalendarza
-- albo kliknięciu „🔗 Link dla montażysty”. Montażysta otwiera go bez logowania pod
-- /m/<token> (api/montaz.js czyta tabelę kluczem service_role po tokenie).
--
-- Brak polityki dla roli anon — z zewnątrz tabela jest niedostępna; token zna tylko ten,
-- kto dostał link. Idempotentna. Uruchom w Supabase SQL Editor.

create table if not exists public.montaz_shares (
  token       text primary key
              default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  tenant_id   uuid not null default (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid,
  deal_id     uuid not null references public.deals(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint montaz_shares_deal_unique unique (deal_id)
);

create index if not exists montaz_shares_tenant_idx on public.montaz_shares(tenant_id);

alter table public.montaz_shares enable row level security;

drop policy if exists "tenant_iso_montaz_shares" on public.montaz_shares;
create policy "tenant_iso_montaz_shares" on public.montaz_shares
  using (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)
  with check (tenant_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid);

-- Gate subskrypcji (jak w 0034) — pętla z 0023 nie obejmuje tabel założonych później.
drop policy if exists subscription_gate on public.montaz_shares;
create policy subscription_gate on public.montaz_shares
  as restrictive for all to authenticated
  using (private.pd_subscription_active())
  with check (private.pd_subscription_active());

comment on table public.montaz_shares is
  'Publiczny (po tokenie) snapshot listy „Do montażu” dla montażysty. Bez cen. Odczyt tylko przez api/montaz.js (service_role).';
