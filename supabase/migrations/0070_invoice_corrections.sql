-- 0070: faktury korygujące (FA(3) RodzajFaktury=KOR) — także do faktur wysłanych do KSeF.
-- Idempotentna. Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql
--
-- Model danych korekty (invoices.doc_type = 'korekta'):
--   * invoice_items            = stan PO korekcie (pelne, poprawione pozycje),
--   * correction_original      = zamrozony stan PRZED korekta (pozycje, dane nabywcy) oraz
--                                odniesienie do faktury pierwotnej (numer, data, numer KSeF),
--   * total_net/vat/gross      = ROZNICA (po - przed), czyli to, co idzie do P_13_x/P_14_x/P_15
--                                w XML FA(3) i do sum na liscie faktur (korekta in minus = kwota ujemna),
--   * invoice_items.corrected_position = nr pozycji, ktora ta linia koryguje (NULL = pozycja dodana
--                                korekta). Pozycje stanu "przed", do ktorych nic nie wskazuje, zostaly usuniete.

alter table public.invoices
  add column if not exists corrects_invoice_id uuid,                 -- faktura korygowana (istnieje od 0001)
  add column if not exists correction_reason   text not null default '',
  add column if not exists correction_type     smallint,             -- FA(3) TypKorekty: 1 | 2 | 3
  add column if not exists correction_original jsonb;

alter table public.invoices
  drop constraint if exists invoices_correction_type_chk;
alter table public.invoices
  add constraint invoices_correction_type_chk
  check (correction_type is null or correction_type in (1, 2, 3));

alter table public.invoice_items
  add column if not exists corrected_position int;

create index if not exists invoices_corrects_idx
  on public.invoices (corrects_invoice_id)
  where corrects_invoice_id is not null;

comment on column public.invoices.corrects_invoice_id is
  'Faktura pierwotna, ktorej dotyczy korekta (doc_type=korekta)';
comment on column public.invoices.correction_type is
  'FA(3) TypKorekty: 1 = skutek w dacie faktury pierwotnej, 2 = w dacie wystawienia korekty, 3 = w innej dacie';
comment on column public.invoices.correction_original is
  'Zamrozony stan faktury przed korekta: {original:{number,issue_date,ksef_number,...}, buyer:{...}, items:[...]}';
comment on column public.invoice_items.corrected_position is
  'Korekta: nr pozycji stanu "przed", ktora ta linia koryguje; NULL = pozycja dodana';
