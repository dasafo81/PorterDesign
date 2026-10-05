-- 0057: szablony maili uzywane przez aplikacje + porzadek na liscie Poczta -> Szablony
-- Szablony, ktore faktycznie dzialaja w aplikacji (wyceny, faktury, zamowienia, opinia, instrukcja prania)
-- dostaja stale template_id i widnieja w Poczta -> Szablony, gdzie mozna je edytowac.
-- Kod laduje je po template_id (src/lib/mailTemplates.js); gdy wiersza brak, uzywa tresci wbudowanej,
-- wiec migracje mozna uruchomic przed lub po wdrozeniu aplikacji.
-- Nieuzywane nigdzie szablony sa usuwane z listy, ale najpierw kopiowane do mail_templates_archive.
-- Migracja dotyczy tylko szablonow Porter Design (najstarszy tenant z szablonami maili, jak w 0055);
-- szablony innych tenantow nie sa ruszane. tenant_id podajemy jawnie, bo SQL Editor nie ma JWT.
-- Migracja jest idempotentna. Uruchom w Supabase SQL Editor:
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

  -- 1) Archiwum + usuniecie szablonow nieuzywanych w zadnym miejscu aplikacji
  create table if not exists public.mail_templates_archive (like public.mail_templates);
  alter table public.mail_templates_archive add column if not exists archived_at timestamptz default now();
  alter table public.mail_templates_archive enable row level security;  -- bez polityk: niedostepne dla anon

  insert into public.mail_templates_archive
    select * from public.mail_templates
     where tenant_id = v_tenant and label in ('Przypomnienie o płatności','Wycena szczegółowa','Pliki PDF','Aktualizacja Oferty po spotkaniu');

  delete from public.mail_templates
   where tenant_id = v_tenant and label in ('Przypomnienie o płatności','Wycena szczegółowa','Pliki PDF','Aktualizacja Oferty po spotkaniu');

  -- 2) Stale template_id dla istniejacych szablonow uzywanych w aplikacji (tresc zostaje bez zmian)
  update public.mail_templates set template_id='wstepna'
   where id=(select id from public.mail_templates where tenant_id=v_tenant and label='Wstępna wycena' order by id limit 1)
     and not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='wstepna');

  update public.mail_templates set template_id='wycena_po_spotkaniu'
   where id=(select id from public.mail_templates where tenant_id=v_tenant and label='Wycena po spotkaniu' order by id limit 1)
     and not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='wycena_po_spotkaniu');

  update public.mail_templates set template_id='opinia'
   where id=(select id from public.mail_templates
              where tenant_id=v_tenant
                and (lower(regexp_replace(label,'\s*[-–—]\s*',' - ','g'))='opinia - swobodna' or label='Prośba o opinię')
              order by (label='Prośba o opinię'), id limit 1)
     and not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='opinia');

  update public.mail_templates set template_id='instrukcja_prania'
   where id=(select id from public.mail_templates where tenant_id=v_tenant and label='Instrukcja prania i czyszczenia' order by id limit 1)
     and not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='instrukcja_prania');

  -- 3) Brakujace szablony systemowe (na koncu listy; tresc jak domyslna w kodzie)
  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'wycena_po_spotkaniu', $l$Wycena po spotkaniu$l$, '📋', $s$Oferta aranżacji okiennych$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>Bardzo dziękuję za niezwykle miłe spotkanie. Zgodnie z naszymi ustaleniami, w załączniku przesyłam ofertę oraz dokładne informacje dotyczące aranżacji okiennych.</div><div><br></div><div>Poniżej przesyłam kluczowe informacje organizacyjne:</div><div><br></div><div><b>Warunki płatności:</b> Rozpoczęcie zamówienia następuje po wpłacie zaliczki w wysokości 50% wartości zlecenia.</div><div><b>Czas realizacji:</b> Wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty.</div><div><br></div><div>Jeśli akceptują Państwo przedstawioną ofertę i przechodzimy do działania, bardzo proszę o potwierdzenie oraz przesłanie danych do wystawienia faktury na wspomnianą zaliczkę.</div><div><br></div><div>W razie jakichkolwiek pytań do załączonego projektu, pozostaję do dyspozycji.</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='wycena_po_spotkaniu')
     and not exists (select 1 from public.mail_templates where tenant_id=v_tenant and label=$l$Wycena po spotkaniu$l$);

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'wstepna', $l$Wstępna wycena$l$, '📨', $s$Wycena aranżacji okiennych$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>Dziękuję za przesłane zapytanie, w odpowiedzi przesyłam wstępną, orientacyjną wycenę oraz informacje odnośnie rodzajów szycia i rolet rzymskich w ofercie.</div><div><br></div><div>Podane ceny są cenami brutto, wyszczególniony jest również koszt montażu, obejmujący montaż osprzętu, powieszenie, wyprasowanie i ułożenie dekoracji.</div><div><br></div><div>Informacje organizacyjne:</div><div><br></div><div><b>Spotkanie:</b> W przypadku zainteresowania, umawiamy się na spotkanie u Państwa na dobór tkanin i wykonanie dokładnego pomiaru. Koszt spotkania wynosi 250 zł i jest odejmowany od całości zamówienia. Po spotkaniu przesyłam dokładną wycenę.</div><div><b>Warunki płatności:</b> Rozpoczęcie zamówienia następuje po wpłacie zaliczki w wysokości 50% wartości zlecenia.</div><div><b>Czas realizacji:</b> Wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty, od połowy października, ze względu na okres przedświąteczny, termin ten może wydłużyć się do ok. 6 tygodni.</div><div><br></div><div>W razie jakichkolwiek pytań, pozostaję do dyspozycji.</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='wstepna')
     and not exists (select 1 from public.mail_templates where tenant_id=v_tenant and label=$l$Wstępna wycena$l$);

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'faktura', $l$Faktura$l$, '🧾', $s$Faktura nr {numer} — {sprzedawca}$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>w załączeniu przesyłam fakturę nr <b>{numer}</b> na kwotę <b>{kwota}</b>{czesc}.</div><div><br></div><div>{terminZdanie}</div><div><br></div><div>Dziękujemy za współpracę. W razie jakichkolwiek pytań pozostaję do dyspozycji.</div><div><br></div><div>Pozdrawiam serdecznie,<br>{podpis}</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='faktura');

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'faktura_zaliczkowa', $l$Faktura zaliczkowa i OWU$l$, '💶', $s$Faktura zaliczkowa nr {numer} i Ogólne Warunki Umowy$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>w załączeniu przesyłam fakturę zaliczkową nr <b>{numer}</b> na kwotę <b>{kwota}</b> (50% wartości zamówienia) oraz Ogólne Warunki Umowy (OWU).</div><div><br></div><div><b>Rozpoczęcie zamówienia</b> następuje po wpłacie zaliczki w terminie wskazanym na fakturze. Zgodnie z OWU dokonanie zapłaty zadatku jest równoznaczne z zapoznaniem się z ich treścią i pełną akceptacją.</div><div><br></div><div><b>Czas realizacji</b> wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty.</div><div><br></div><div>W razie jakichkolwiek pytań pozostaję do dyspozycji.</div><div><br></div><div>Pozdrawiam serdecznie,<br>{podpis}</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='faktura_zaliczkowa');

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'zamowienie_osprzetu', $l$Zamówienie osprzętu$l$, '🔩', $s$Zamówienie osprzętu — {clientName}$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>W załączeniu przesyłam zamówienie osprzętu.</div><div><br></div><div>Proszę o potwierdzenie terminu dostawy.</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='zamowienie_osprzetu');

  insert into public.mail_templates (tenant_id, template_id, label, icon, subject, body, sort_order)
  select v_tenant, 'zamowienie_tkaniny', $l$Zamówienie tkaniny$l$, '🧵', $s$Zamówienie tkaniny — {clientName}$s$,
  $b$<div>Dzień dobry,</div><div><br></div><div>W załączeniu przesyłam zamówienie tkaniny.</div><div><br></div><div>Proszę o potwierdzenie dostępności i terminu wysyłki.</div>$b$,
  coalesce((select max(sort_order) from public.mail_templates where tenant_id=v_tenant),0)+1
   where not exists (select 1 from public.mail_templates where tenant_id=v_tenant and template_id='zamowienie_tkaniny');

end
$mig$;
