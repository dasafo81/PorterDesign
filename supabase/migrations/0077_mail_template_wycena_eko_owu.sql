-- 0077: szablon "Wycena szczegółowa i OWU" (template_id = 'wycena_eko_owu')
-- Używany przy wysyłce wyceny szczegółowej klientowi, któremu wystawiono fakturę EKO:
-- do maila dołącza się OWU (public/mail-att/OWU.pdf), a treść opisuje, co przesyłamy.
-- Kod ma tę samą treść wbudowaną (src/lib/mailTemplates.js), więc migrację można uruchomić
-- przed lub po wdrożeniu; po niej szablon da się edytować w Poczta -> Szablony.
-- Dotyczy szablonów Porter Design (najstarszy tenant z szablonami maili, jak w 0057).
-- Idempotentna. Uruchom w Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

do $mig$
declare
  v_tenant uuid;
begin
  select id into v_tenant from public.tenants
   where id in (select tenant_id from public.mail_templates)
   order by created_at asc limit 1;
  if v_tenant is null then
    raise exception 'Brak tenanta z szablonami maili (tabela mail_templates jest pusta?)';
  end if;

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'wycena_eko_owu', $l$Wycena szczegółowa i OWU$l$, '📎', $s$Aranżacje okienne - zamówienie i OWU$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>w załączeniu przesyłam szczegółową ofertę (wycenę) aranżacji okiennych oraz Ogólne Warunki Umowy (OWU).</div><div><br></div><div>Bardzo proszę o zapoznanie się z OWU. Zgodnie z nimi dokonanie wpłaty jest równoznaczne z zapoznaniem się z ich treścią i pełną akceptacją.</div><div><br></div><div>W razie jakichkolwiek pytań pozostaję do dyspozycji.</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='wycena_eko_owu');

  -- Jeśli migracja była już uruchomiona ze starym tematem — popraw go (tylko gdy nikt go nie zmienił)
  update public.mail_templates
     set subject = $s$Aranżacje okienne - zamówienie i OWU$s$
   where tenant_id = v_tenant and template_id = 'wycena_eko_owu'
     and subject = $s$Oferta aranżacji okiennych i Ogólne Warunki Umowy$s$;
end
$mig$;
