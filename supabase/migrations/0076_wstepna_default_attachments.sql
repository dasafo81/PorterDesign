-- 0076: szablon "Wstępna wycena" — załączniki domyślne z repo (public/mail-att/).
-- Nowy PDF "Zasłony-Firany_PD.pdf" (11 stron) leży w public/mail-att/ i jest dołączany z kodu.
-- Kod używa jednak plików z bazy (mail_templates.template_files), gdy są wpisane — wtedy
-- w mailu wychodziłaby stara wersja PDF z Storage. Ta migracja czyści template_files
-- szablonu 'wstepna', ale TYLKO gdy zawiera wyłącznie standardowe PDF-y (zasłony/rolety);
-- jeśli ktoś dopiął inny własny plik, szablon zostaje nietknięty (podmień wtedy plik zasłon
-- ręcznie w Poczta -> Szablony). Po wyczyszczeniu aplikacja dołącza oba pliki z public/mail-att/.
-- Idempotentna. Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

update public.mail_templates
   set template_files = '[]'
 where template_id = 'wstepna'
   and coalesce(jsonb_array_length(template_files::jsonb), 0) > 0
   and not exists (
         select 1
           from jsonb_array_elements(template_files::jsonb) e
          where coalesce(e->>'name', '') !~* '(zas.ony|firany|rolety).*\.pdf'
       );
