-- 0074: szablony maili z karty deala / Faktur bez własnego "Pozdrawiam," na końcu.
-- Podpis z Poczta -> Ustawienia (doklejany do każdej wysyłki) już zawiera pozdrowienie,
-- więc w mailu wychodziło ono dwa razy. Usuwa końcowy akapit "Pozdrawiam,"
-- (także "Pozdrawiam serdecznie,<br>{podpis}") wraz z pustą linią przed nim.
-- Idempotentna; ruszą tylko szablony systemowe, reszta treści (własne edycje) zostaje.
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

update public.mail_templates
   set body = regexp_replace(
         body,
         '(<div><br></div>)?<div>Pozdrawiam( serdecznie)?,(<br>\{podpis\})?</div>\s*$',
         ''
       )
 where template_id in ('faktura', 'ponaglenie', 'faktura_zaliczkowa', 'wplata_start')
   and body ~ '<div>Pozdrawiam( serdecznie)?,(<br>\{podpis\})?</div>\s*$';
