-- 0067: mail "potwierdzenie wpłaty + start realizacji" (CRM, karta deala → Start realizacji)
-- Znacznik wysłania + szablon do edycji w Poczta -> Szablony (kod ma tę samą treść domyślną,
-- więc migrację można uruchomić przed lub po wdrożeniu aplikacji). Idempotentna.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

alter table public.deals
  add column if not exists payment_confirm_sent_at timestamptz;

comment on column public.deals.payment_confirm_sent_at is
  'Kiedy z karty deala wysłano klientowi potwierdzenie wpłaty i informację o starcie realizacji';

do $mig$
declare
  v_tenant uuid;
begin
  select id into v_tenant from public.tenants
   where id in (select tenant_id from public.mail_templates)
   order by created_at asc limit 1;
  if v_tenant is null then
    return;
  end if;

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'wplata_start', $l$Potwierdzenie wpłaty i start realizacji$l$, '✅',
  $s$Potwierdzenie wpłaty i rozpoczęcie realizacji zamówienia$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>potwierdzam zarejestrowanie wpłaty{wplata} i informuję, że rozpoczynamy realizację zamówienia.</div><div><br></div><div>{terminZdanie}</div><div><br></div><div>Pozdrawiam,</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='wplata_start');
end
$mig$;
