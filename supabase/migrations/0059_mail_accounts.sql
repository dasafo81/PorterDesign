-- Własna skrzynka pocztowa (IMAP/SMTP) dla innych dostawców niż Gmail i Outlook.
-- Hasło jest szyfrowane po stronie serwera (AES-GCM, ten sam klucz co tokeny OAuth);
-- RLS włączone bez żadnej polityki = tabela dostępna wyłącznie dla service role (API).
create table if not exists public.mail_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null,
  imap_host text not null,
  imap_port integer not null default 993,
  imap_secure boolean not null default true,
  smtp_host text not null,
  smtp_port integer not null default 465,
  smtp_secure boolean not null default true,
  password_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mail_accounts enable row level security;
