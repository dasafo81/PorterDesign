# Porter Design — instrukcje dla Claude

## Git
- Po zakończeniu zmian zawsze merguj i pushuj na `main` (aplikacja wdraża się z `main`).
  Właściciel projektu wyraził na to stałą zgodę, nie trzeba pytać za każdym razem.
- Najpierw `git fetch origin main`; jeśli `main` poszedł do przodu, zmerguj go do swojej gałęzi
  i rozwiąż konflikty przed pushem. Nie używaj force-push na `main`.
- Nie twórz pull requestów, chyba że użytkownik o to poprosi.
- Zmiany w bazie dodawaj jako nową migrację w `supabase/migrations/` i napisz użytkownikowi,
  że trzeba ją uruchomić w Supabase.
