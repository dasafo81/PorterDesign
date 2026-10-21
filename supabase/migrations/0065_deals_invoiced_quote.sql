-- 0065: wycena zamrożona jako podstawa faktur dealu
-- W momencie wystawienia pierwszej faktury (50%) karta deala zapisuje tu kopię wyceny wysłanej klientowi
-- (suma, pomieszczenia, montaż, rabat, koszt wizyty). Druga faktura liczy się z tej kopii, a nie z bieżącej
-- wyceny — dzięki temu późniejsze zmiany (np. zamiennik tkaniny z magazynu) nie zmieniają kwoty do zafakturowania.

alter table public.deals
  add column if not exists invoiced_quote jsonb;

comment on column public.deals.invoiced_quote is 'Zamrożona wycena będąca podstawą faktur: {frozen_at,total,bez_montazu,montaz,montaz_pct,rabat,wizyta,rooms:[{name,total}],invoice_number}';
