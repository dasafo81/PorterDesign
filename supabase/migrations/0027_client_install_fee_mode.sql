-- Allow installation fee to be stored either as a percentage or a fixed amount.
-- Existing rows remain percentage-based through the application default.
alter table public.clients
  add column if not exists install_fee_mode text not null default 'percent';

alter table public.clients
  add constraint clients_install_fee_mode_check
  check (install_fee_mode in ('percent', 'amount'));
