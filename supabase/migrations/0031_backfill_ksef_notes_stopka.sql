-- Migracja 0031: uzupelnij Uwagi ze StopkaFaktury i Zwolnienie/P_19A-C dla juz
-- zsynchronizowanych faktur.
--
-- Migracja 0030 sprawdzala WYLACZNIE <DodatkowyOpis> — nie <StopkaFaktury> ani
-- <Zwolnienie><P_19A|B|C>, ktorych rowniez uzywaja programy ksiegowe dostawcow.
-- Potwierdzone na realnym xml_payload faktury NITECZKAMI FV/26/08/5 (system
-- wystawcy: Scanye), gdzie notatka o zwolnieniu z VAT siedzi w:
--   <Stopka><Informacje><StopkaFaktury>Dostawa zwolniona z art. 113...</StopkaFaktury></Informacje></Stopka>
--
-- Bezpieczna do wielokrotnego uruchomienia: dotyka wylacznie rekordow z aktualnie
-- pustymi Uwagami (0030 juz naprawilo te z DodatkowyOpis, wiec te nie zostana
-- ponownie tkniete).

DO $$
DECLARE
  r RECORD;
  parts TEXT[];
  zwolnienie_block TEXT;
  p19_text TEXT;
  opis_block TEXT;
  wartosc_matches TEXT[];
  dod_opis_text TEXT;
  stopka_text TEXT;
  final_notes TEXT;
BEGIN
  FOR r IN
    SELECT id, xml_payload
    FROM invoices
    WHERE xml_payload IS NOT NULL
      AND (notes IS NULL OR notes = '')
  LOOP
    parts := ARRAY[]::TEXT[];

    -- 1) Zwolnienie/P_19A|P_19B|P_19C — podstawa prawna zwolnienia z VAT
    zwolnienie_block := (regexp_match(r.xml_payload, '<Zwolnienie>(.*?)</Zwolnienie>'))[1];
    IF zwolnienie_block IS NOT NULL THEN
      p19_text := COALESCE(
        (regexp_match(zwolnienie_block, '<P_19A>(.*?)</P_19A>'))[1],
        (regexp_match(zwolnienie_block, '<P_19B>(.*?)</P_19B>'))[1],
        (regexp_match(zwolnienie_block, '<P_19C>(.*?)</P_19C>'))[1]
      );
      IF p19_text IS NOT NULL AND btrim(p19_text) <> '' THEN
        parts := array_append(parts, 'Podstawa zwolnienia z VAT: ' || btrim(p19_text));
      END IF;
    END IF;

    -- 2) DodatkowyOpis/Wartosc, z fallbackiem na StopkaFaktury gdy brak DodatkowyOpis
    opis_block := (regexp_match(r.xml_payload, '<DodatkowyOpis>(.*?)</DodatkowyOpis>'))[1];
    IF opis_block IS NOT NULL THEN
      SELECT array_agg(m[1]) INTO wartosc_matches
      FROM regexp_matches(opis_block, '<Wartosc>(.*?)</Wartosc>', 'g') AS m;

      IF wartosc_matches IS NOT NULL AND array_length(wartosc_matches, 1) > 0 THEN
        dod_opis_text := array_to_string(wartosc_matches, ' | ');
      ELSE
        dod_opis_text := trim(regexp_replace(opis_block, '<[^>]+>', ' ', 'g'));
        dod_opis_text := trim(regexp_replace(dod_opis_text, '\s+', ' ', 'g'));
      END IF;

      IF dod_opis_text IS NOT NULL AND dod_opis_text <> '' THEN
        parts := array_append(parts, dod_opis_text);
      END IF;
    ELSE
      stopka_text := (regexp_match(r.xml_payload, '<StopkaFaktury>(.*?)</StopkaFaktury>'))[1];
      IF stopka_text IS NOT NULL THEN
        stopka_text := trim(regexp_replace(stopka_text, '<[^>]+>', ' ', 'g'));
        stopka_text := trim(regexp_replace(stopka_text, '\s+', ' ', 'g'));
        IF stopka_text <> '' THEN
          parts := array_append(parts, stopka_text);
        END IF;
      END IF;
    END IF;

    IF array_length(parts, 1) > 0 THEN
      final_notes := array_to_string(parts, ' | ');
      UPDATE invoices SET notes = final_notes, updated_at = now() WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Weryfikacja:
-- SELECT id, number, notes FROM invoices WHERE number = 'FV/26/08/5';
