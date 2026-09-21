-- 0052: kroki zamówienia na dealu (CRM, kolumna Zamówienie)
-- Osprzęt / tkanina / szycie — odklikiwane ręcznie na karcie deala.
-- Po zaznaczeniu wszystkich trzech deal automatycznie przechodzi do etapu "realizacja".
-- Niezależne od deals.sewing_confirmed ("zlecenie potwierdzone przez szwalnię").

alter table public.deals
  add column if not exists order_hardware boolean not null default false,
  add column if not exists order_fabric   boolean not null default false,
  add column if not exists order_sewing   boolean not null default false;

comment on column public.deals.order_hardware is 'Osprzęt (karnisze/szyny) zamówiony';
comment on column public.deals.order_fabric   is 'Tkanina zamówiona';
comment on column public.deals.order_sewing   is 'Szycie zlecone';
