-- supabase/migrations/0039_fr_fabrics_flame_retardant.sql
-- ── KATALOG: automatyczne oznaczenie tkanin "FR" jako trudnopalne ────────
-- 22 pozycje bazowego cennika (FABRICS w src/constants/data.js) mają w nazwie
-- dopisek "FR" (flame retardant), np. "Bercy FR", "Dimout FR", "Scot Fr".
-- Ten skrót nie jest zakodowany strukturalnie (to część tekstu name), więc
-- nie da się go wyczytać automatycznie w aplikacji — trzeba go oznaczyć raz,
-- tak samo jak każdą inną ręczną zmianę w Katalogu: tworząc wiersz-nadpisanie
-- (base_key = "tkaniny::<nazwa>") z flame_retardant = true. Pozostałe pola
-- zostają puste (NULL) — mergeCatalog() w ScreenWarehouse.jsx i tak spada
-- z powrotem do wartości bazowych z cennika dla każdego pola, które nie jest
-- nadpisane.
--
-- Bezpieczne do wielokrotnego uruchomienia: UPDATE dla wierszy, które już
-- mają nadpisanie (z dowolnego innego powodu), INSERT tylko dla tych, które
-- jeszcze nie mają żadnego wiersza w catalog_items.
--
-- Uruchom w Supabase SQL Editor: https://supabase.com/dashboard/project/rkcidwusjzvfwxszotnb/sql

do $$
declare
  v_tenant uuid;
  v_keys text[] := array[
    'tkaniny::Bercy FR','tkaniny::Boston FR','tkaniny::Breeze FR',
    'tkaniny::California FR Blackout','tkaniny::Cosmos FR Dimout',
    'tkaniny::Eclipse Black Out FR','tkaniny::FR California Blackout',
    'tkaniny::Jowisz Blackout FR','tkaniny::Mesh FR','tkaniny::Neptun FR Dimout',
    'tkaniny::Opera FR 1340','tkaniny::Opera FR 9338','tkaniny::Roma FR Black-Out',
    'tkaniny::Saviour FR Dimout','tkaniny::Typic FR','tkaniny::Scot Fr',
    'tkaniny::Blackout Alaves FR','tkaniny::Blackout Atalanta FR',
    'tkaniny::Blackout Crotone FR 150','tkaniny::Blackout Crotone FR 280',
    'tkaniny::Blackout Leganes FR','tkaniny::Dimout FR'
  ];
  v_key text;
begin
  select coalesce(
    (select tenant_id from catalog_items limit 1),
    (select tenant_id from entities where is_default limit 1),
    (select tenant_id from clients limit 1)
  ) into v_tenant;

  if v_tenant is null then
    raise exception 'Nie znaleziono tenant_id — uruchom to ręcznie z poprawnym tenant_id.';
  end if;

  -- 1) Wiersze, które już mają nadpisanie w Katalogu → tylko dopisz flagę
  update catalog_items
    set flame_retardant = true, updated_at = now()
    where base_key = any(v_keys);

  -- 2) Reszta (bazowa pozycja bez dotychczasowego nadpisania) → nowy wiersz.
  -- Kolumna "name" ma constraint NOT NULL bez wartości domyślnej — trzeba ją
  -- wypełnić (wyciągamy z base_key, usuwając prefiks "tkaniny::").
  foreach v_key in array v_keys loop
    if not exists (select 1 from catalog_items where base_key = v_key) then
      insert into catalog_items (tenant_id, group_id, base_key, name, flame_retardant)
      values (v_tenant, 'tkaniny', v_key, regexp_replace(v_key, '^tkaniny::', ''), true);
    end if;
  end loop;
end $$;
