-- 0053: znacznik wysłania maila "faktura zaliczkowa 50% + OWU" (CRM, etap zaliczka)
-- Ustawiany po udanej wysyłce z karty deala; pokazuje "✓ Wysłano dd.mm.rrrr" i chroni przed dublem.

alter table public.deals
  add column if not exists advance_sent_at timestamptz;

comment on column public.deals.advance_sent_at is
  'Kiedy z karty deala wysłano mail z fakturą zaliczkową (50%) i OWU';
