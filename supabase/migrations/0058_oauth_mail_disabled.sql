-- Wylogowanie z Gmaila w module Mail nie może odłączać Kalendarza Google: oba korzystają z jednego
-- połączenia (provider='google'). Zamiast je kasować, oznaczamy, że poczta jest wyłączona.
alter table public.oauth_connections
  add column if not exists mail_disabled boolean not null default false;

comment on column public.oauth_connections.mail_disabled is
  'true = użytkownik wylogował się z Gmaila w module Mail; połączenie zostaje dla Kalendarza Google.';
