-- 0066: szablony faktur bez wpisanego na stałe podpisu — podpis z Poczta -> Ustawienia jest doklejany
-- do każdego maila wysyłanego z karty deala i z modułu Faktury. Treść kończy się samym "Pozdrawiam,".
-- Szablon "Faktura zaliczkowa i OWU" skrócony: sama faktura + OWU (bez mieszania zaliczki z zadatkiem).
-- Idempotentna; zmienia tylko szablony, które nadal mają dotychczasową treść domyślną (własne edycje zostają).
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

update public.mail_templates
   set subject = 'Faktura nr {numer} i Ogólne Warunki Umowy',
       body = '<div>Dzień dobry,</div><div><br></div><div>w załączeniu przesyłamy fakturę nr <b>{numer}</b> oraz Ogólne Warunki Umowy (OWU).</div><div><br></div><div>Pozdrawiam,</div>'
 where template_id = 'faktura_zaliczkowa'
   and body like '%Rozpoczęcie zamówienia</b> następuje po wpłacie zaliczki w terminie wskazanym na fakturze%';

update public.mail_templates
   set body = replace(body, 'Pozdrawiam serdecznie,<br>{podpis}', 'Pozdrawiam,')
 where template_id in ('faktura', 'ponaglenie')
   and body like '%Pozdrawiam serdecznie,<br>{podpis}%';
