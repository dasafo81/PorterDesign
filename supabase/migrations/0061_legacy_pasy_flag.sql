-- Wersjonowanie liczenia pasów zasłon/firan (obracanie tkaniny, calc() w constants/data.js).
-- Nowe liczenie: zapas 10 cm na każdy pas, zaczęty pas = pełny pas, brak korekty parowania.
-- Stare wyceny (m.in. już wysłane i zafakturowane) mają zachować dotychczasowe kwoty,
-- więc każdej zasłonie/firanie w ISTNIEJĄCYCH wycenach dopisujemy "legacyPasy": true.
-- Pozycje bez tej flagi (wszystkie nowe) liczą się nowym sposobem.
--
-- WYJĄTKI (zostają na NOWYM liczeniu, nie dostają flagi):
--   100  Joanna Tybora
--   135  Reanata Franke TKANINY
--   201  Jagoda Śliwka
--   215  Jagoda Śliwka (2)
--   216  Radosław Likos
--   238  Anna Doogan
--
-- Uruchom w Supabase SQL Editor PRZED wdrożeniem kodu na main.
-- Zmiana kolumny rooms uruchamia trigger snapshotów (0040), więc stan sprzed zmiany
-- zostaje w historii wersji klienta.

update public.clients c
set rooms = (
  select coalesce(jsonb_agg(
    case when jsonb_typeof(r->'windows') = 'array' then
      jsonb_set(r, '{windows}', (
        select coalesce(jsonb_agg(
          case when jsonb_typeof(w->'products') = 'array' then
            jsonb_set(w, '{products}', (
              select coalesce(jsonb_agg(
                case when p->>'type' in ('zaslona', 'firana')
                     then p || '{"legacyPasy": true}'::jsonb
                     else p end
              ), '[]'::jsonb)
              from jsonb_array_elements(w->'products') p
            ))
          else w end
        ), '[]'::jsonb)
        from jsonb_array_elements(r->'windows') w
      ))
    else r end
  ), '[]'::jsonb)
  from jsonb_array_elements(c.rooms) r
)
where jsonb_typeof(c.rooms) = 'array'
  and c.id not in (100, 135, 201, 215, 216, 238);
