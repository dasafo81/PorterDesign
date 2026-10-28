-- Aplikacja zapisuje na fakturach flagi `paid` i `approved`, ale żadna migracja ich nie tworzyła.
-- Gdy kolumny nie było, zmiana statusu płatności ("Zapłacono") kończyła się błędem zapisu.
alter table public.invoices
  add column if not exists paid     boolean not null default false,
  add column if not exists approved boolean not null default false;

-- Wsteczna zgodność: faktury już oznaczone jako zapłacone przez payment_status.
update public.invoices set paid = true where payment_status = 'paid' and paid = false;
