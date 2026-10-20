-- 0064: historia zleceń szycia na dealu
-- Każde zlecenie wysłane mailem z Podsumowania dopisuje wpis {house, sent_date, term}.
-- Pola sewing_house / sewing_sent_date / sewing_term zostają jako "ostatnie zlecenie".

alter table public.deals
  add column if not exists sewing_orders jsonb not null default '[]'::jsonb;

comment on column public.deals.sewing_orders is 'Lista wysłanych zleceń szycia: [{house, sent_date, term}]';
