-- 0078: szablon 'wycena_eko_owu' ("Wycena szczegółowa i OWU") — treść mówi o zamówieniu, nie o ofercie/wycenie.
-- Załącznik wysyłany razem z OWU to zamówienie (bez kwot), więc w mailu nie może być mowy o wycenie.
-- Poprawia treść tylko wtedy, gdy nadal jest taka, jak wstawiła ją migracja 0077 (ręcznie edytowanych
-- szablonów nie rusza). Idempotentna. Uruchom w Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

update public.mail_templates
   set label = $l$Zamówienie i OWU$l$,
       body  = replace(body,
         $o$w załączeniu przesyłam szczegółową ofertę (wycenę) aranżacji okiennych oraz Ogólne Warunki Umowy (OWU).$o$,
         $n$w załączeniu przesyłam zamówienie aranżacji okiennych oraz Ogólne Warunki Umowy (OWU).$n$)
 where template_id = 'wycena_eko_owu'
   and body like '%szczegółową ofertę (wycenę) aranżacji okiennych%';
