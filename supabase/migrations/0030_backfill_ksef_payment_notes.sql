-- Migracja 0030: napraw payment_method i notes dla faktur juz zsynchronizowanych z KSeF
-- (przed poprawka kodow FA(3) w ksef-receive/index.ts, zgloszenie 2026-08-20,
-- przyklad: NITECZKAMI FV/26/08/5 — "Kredyt" zamiast "Przelew", puste Uwagi mimo
-- widocznej notatki "Dostawa zwolniona z art. 113...").
--
-- Dziala WYLACZNIE na podstawie xml_payload (surowy XML zapisany przy synchronizacji),
-- wiec jest bezpieczna do wielokrotnego uruchomienia: raz naprawiony rekord przestaje
-- pasowac do warunkow WHERE i nie zostanie tkniety ponownie. Recznie skorygowane przez
-- kogos wartosci payment_method rowniez nie zostana nadpisane — UPDATE dotyka tylko
-- rekordow, ktorych obecna wartosc dokladnie odpowiada staremu, zepsutemu mapowaniu.

-- ── 1) Podglad przed zmiana: ile rekordow zostanie dotknietych ──────────────
-- (uruchom osobno, zeby zobaczyc skale przed samym UPDATE-em)
-- SELECT id, number, payment_method,
--        (regexp_match(xml_payload, '<FormaPlatnosci>(\d)</FormaPlatnosci>'))[1] AS kod_w_xml
-- FROM invoices
-- WHERE xml_payload IS NOT NULL;

-- ── 2) Napraw payment_method ──────────────────────────────────────────────
-- Oficjalne kody FA(3): 1-gotowka, 2-karta, 3-bon, 4-czek, 5-kredyt, 6-przelew, 7-mobilna.
-- Stary (zepsuty) parser mapowal: 2->przelew, 3->karta, 4->bon, 5->czek, 6->kredyt
-- (kody 2-6 przesuniete o jedna pozycje). UPDATE dotyka tylko rekordow, ktore wciaz
-- maja ta zepsuta wartosc — tak by nie nadpisac recznych korekt.
WITH extracted AS (
  SELECT
    id,
    payment_method AS current_value,
    (regexp_match(xml_payload, '<FormaPlatnosci>(\d)</FormaPlatnosci>'))[1] AS code
  FROM invoices
  WHERE xml_payload IS NOT NULL
)
UPDATE invoices i
SET payment_method = CASE e.code
      WHEN '1' THEN 'gotówka'
      WHEN '2' THEN 'karta'
      WHEN '3' THEN 'bon'
      WHEN '4' THEN 'czek'
      WHEN '5' THEN 'kredyt'
      WHEN '6' THEN 'przelew'
      WHEN '7' THEN 'mobilna'
    END,
    updated_at = now()
FROM extracted e
WHERE i.id = e.id
  AND e.code IS NOT NULL
  AND i.payment_method = CASE e.code
      WHEN '1' THEN 'gotówka'
      WHEN '2' THEN 'przelew'   -- stary bug
      WHEN '3' THEN 'karta'     -- stary bug
      WHEN '4' THEN 'bon'       -- stary bug
      WHEN '5' THEN 'czek'      -- stary bug
      WHEN '6' THEN 'kredyt'    -- stary bug
      WHEN '7' THEN 'mobilna'
      ELSE NULL
    END;

-- ── 3) Napraw notes ────────────────────────────────────────────────────────
-- Stary parser szukal nieistniejacego tagu <P_Opis>, wiec notes ZAWSZE wychodzilo
-- puste dla synchronizowanych faktur. Odtwarzamy je z <DodatkowyOpis><Wartosc>...
-- (ten sam format, ktorego uzywa nasz wlasny generator ksef-send/index.ts), z
-- fallbackiem na oczyszczenie tagow XML gdy dostawca uzyl innej struktury.
-- Dotyka WYLACZNIE rekordow z aktualnie pustymi Uwagami (bug zawsze dawal pusty
-- string, wiec niepuste notes to albo juz naprawiony rekord, albo recznie
-- wpisana notatka — obu nie ruszamy).
DO $$
DECLARE
  r RECORD;
  opis_block TEXT;
  wartosc_matches TEXT[];
  new_notes TEXT;
BEGIN
  FOR r IN
    SELECT id, xml_payload
    FROM invoices
    WHERE xml_payload IS NOT NULL
      AND (notes IS NULL OR notes = '')
  LOOP
    opis_block := (regexp_match(r.xml_payload, '<DodatkowyOpis>(.*?)</DodatkowyOpis>'))[1];
    IF opis_block IS NOT NULL THEN
      SELECT array_agg(m[1]) INTO wartosc_matches
      FROM regexp_matches(opis_block, '<Wartosc>(.*?)</Wartosc>', 'g') AS m;

      IF wartosc_matches IS NOT NULL AND array_length(wartosc_matches, 1) > 0 THEN
        new_notes := array_to_string(wartosc_matches, ' | ');
      ELSE
        new_notes := trim(regexp_replace(opis_block, '<[^>]+>', ' ', 'g'));
        new_notes := trim(regexp_replace(new_notes, '\s+', ' ', 'g'));
      END IF;

      IF new_notes IS NOT NULL AND new_notes <> '' THEN
        UPDATE invoices SET notes = new_notes, updated_at = now() WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 4) Weryfikacja po zmianie ─────────────────────────────────────────────
-- SELECT id, number, payment_method, notes FROM invoices
-- WHERE xml_payload IS NOT NULL ORDER BY updated_at DESC LIMIT 20;
