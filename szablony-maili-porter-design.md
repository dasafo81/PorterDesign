# Szablony maili w aplikacji Porter Design

Eksport z kodu repozytorium (2026-11-18). Dokument dzieli się na 4 części:

1. **Szablony systemowe** — edytowalne w aplikacji (Poczta → Szablony), mają stałe `template_id`.
2. **Szablony tylko w bazie** — „Opinia" i „Instrukcja prania": ich treści nie ma w kodzie, więc **nie ma ich w tym eksporcie** (patrz uwaga niżej).
3. **Teksty wpisane na stałe w kod** — nie da się ich zmienić w Szablonach, zmiana wymaga edycji kodu.
4. **Maile techniczne** (np. powiadomienie o prośbie o demo).

## Ważne
- Treść poniżej to **domyślna treść z kodu**. Jeśli ktoś edytował szablon w Poczta → Szablony, **w mailach wychodzi wersja z bazy Supabase**, a nie ta z kodu. Aktualną wersję z bazy widać w aplikacji albo w tabeli `mail_templates`.
- Do każdego maila z karty deala i z modułu Faktury **doklejany jest podpis** z Poczta → Ustawienia, dlatego szablony faktur nie mają własnego „Pozdrawiam".
- Zmienne w `{nawiasach}` są podstawiane automatycznie. Nieznane zostają bez zmian.
- Poniższe wersje faktur/ponaglenia/wpłaty są w kodzie bez „Pozdrawiam" (migracja 0074 usunęła je też z bazy).

---

## 1. Szablony systemowe (Poczta → Szablony)

### 📋 Wycena po spotkaniu  
`template_id: wycena_po_spotkaniu`

- **Gdzie używany:** Podsumowanie → Wyślij klientowi oraz Podgląd oferty → Wyślij mailem. W Poczcie oznaczony jako domyślny.
- **Zmienne:** {clientName}, {honorific}, {total}, {zaliczka}
- **Załączniki domyślne:** brak

**Temat:** Oferta aranżacji okiennych

**Treść:**

> Dzień dobry,
>
> Bardzo dziękuję za niezwykle miłe spotkanie. Zgodnie z naszymi ustaleniami, w załączniku przesyłam ofertę oraz dokładne informacje dotyczące aranżacji okiennych.
>
> Poniżej przesyłam kluczowe informacje organizacyjne:
>
> **Warunki płatności:** Rozpoczęcie zamówienia następuje po wpłacie zaliczki w wysokości 50% wartości zlecenia.
> **Czas realizacji:** Wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty.
>
> Jeśli akceptują Państwo przedstawioną ofertę i przechodzimy do działania, bardzo proszę o potwierdzenie oraz przesłanie danych do wystawienia faktury na wspomnianą zaliczkę.
>
> W razie jakichkolwiek pytań do załączonego projektu, pozostaję do dyspozycji.

---

### 📨 Wstępna wycena  
`template_id: wstepna`

- **Gdzie używany:** Wycena uproszczona → Wyślij mailem, razem z załączonymi plikami szablonu (domyślnie dwa PDF-y).
- **Zmienne:** {clientName}, {honorific}, {total}, {zaliczka}
- **Załączniki domyślne:** Zasłony-Firany_PD.pdf, Rolety_rzymskie_PD.pdf

**Temat:** Wycena aranżacji okiennych

**Treść:**

> Dzień dobry,
>
> Dziękuję za przesłane zapytanie, w odpowiedzi przesyłam wstępną, orientacyjną wycenę oraz informacje odnośnie rodzajów szycia i rolet rzymskich w ofercie.
>
> Podane ceny są cenami brutto, wyszczególniony jest również koszt montażu, obejmujący montaż osprzętu, powieszenie, wyprasowanie i ułożenie dekoracji.
>
> Informacje organizacyjne:
>
> **Spotkanie:** W przypadku zainteresowania, umawiamy się na spotkanie u Państwa na dobór tkanin i wykonanie dokładnego pomiaru. Koszt spotkania wynosi 250 zł i jest odejmowany od całości zamówienia. Po spotkaniu przesyłam dokładną wycenę.
> **Warunki płatności:** Rozpoczęcie zamówienia następuje po wpłacie zaliczki w wysokości 50% wartości zlecenia.
> **Czas realizacji:** Wynosi ok. 4 tygodni od momentu zaksięgowania wpłaty, od połowy października, ze względu na okres przedświąteczny, termin ten może wydłużyć się do ok. 6 tygodni.
>
> W razie jakichkolwiek pytań, pozostaję do dyspozycji.

---

### 🧾 Faktura  
`template_id: faktura`

- **Gdzie używany:** Moduł Faktury → Wyślij fakturę oraz CRM, karta deala → wysyłka faktury dla klienta.
- **Zmienne:** {numer}, {kwota}, {czesc}, {terminZdanie}, {sprzedawca}
- **Załączniki domyślne:** brak

**Temat:** Faktura nr {numer} — {sprzedawca}

**Treść:**

> Dzień dobry,
>
> w załączeniu przesyłam fakturę nr **{numer}** na kwotę **{kwota}**{czesc}.
>
> {terminZdanie}
>
> Dziękujemy za współpracę. W razie jakichkolwiek pytań pozostaję do dyspozycji.

---

### ⏰ Ponaglenie do zapłaty  
`template_id: ponaglenie`

- **Gdzie używany:** CRM, karta deala → Rozliczenie z klientem → ⏰ Ponagl (przy fakturze po terminie).
- **Zmienne:** {numer}, {kwota}, {terminZdanie}, {sprzedawca}
- **Załączniki domyślne:** brak

**Temat:** Przypomnienie o płatności — faktura nr {numer}

**Treść:**

> Dzień dobry,
>
> uprzejmie przypominam, że termin płatności faktury nr **{numer}** na kwotę **{kwota}** upłynął{terminZdanie}.
>
> Jeśli wpłata została już zrealizowana, proszę potraktować tę wiadomość jako bezprzedmiotową. W przeciwnym razie bardzo proszę o uregulowanie należności w najbliższym możliwym terminie.
>
> Fakturę przesyłam ponownie w załączeniu. W razie jakichkolwiek pytań pozostaję do dyspozycji.

---

### 💶 Faktura zaliczkowa i OWU  
`template_id: faktura_zaliczkowa`

- **Gdzie używany:** CRM, karta deala → wysyłka faktury zaliczkowej z OWU (OWU dołącza się automatycznie).
- **Zmienne:** {numer}, {kwota}
- **Załączniki domyślne:** brak

**Temat:** Faktura nr {numer} i Ogólne Warunki Umowy

**Treść:**

> Dzień dobry,
>
> w załączeniu przesyłamy fakturę nr **{numer}** oraz Ogólne Warunki Umowy (OWU).

---

### ✅ Potwierdzenie wpłaty i start realizacji  
`template_id: wplata_start`

- **Gdzie używany:** CRM, karta deala → Start realizacji → ✉ Wyślij (potwierdzenie wpłaty i informacja o rozpoczęciu realizacji).
- **Zmienne:** {wplata}, {terminZdanie}
- **Załączniki domyślne:** brak

**Temat:** Potwierdzenie wpłaty i rozpoczęcie realizacji zamówienia

**Treść:**

> Dzień dobry,
>
> potwierdzam zarejestrowanie wpłaty{wplata} i informuję, że rozpoczynamy realizację zamówienia.
>
> {terminZdanie}

---

### 🔩 Zamówienie osprzętu  
`template_id: zamowienie_osprzetu`

- **Gdzie używany:** Podgląd zamówienia osprzętu → Wyślij mailem.
- **Zmienne:** {clientName}
- **Załączniki domyślne:** brak

**Temat:** Zamówienie osprzętu — {clientName}

**Treść:**

> Dzień dobry,
>
> W załączeniu przesyłam zamówienie osprzętu.
>
> Proszę o potwierdzenie terminu dostawy.

---

### 🧵 Zamówienie tkaniny  
`template_id: zamowienie_tkaniny`

- **Gdzie używany:** Podgląd zamówienia tkaniny → Wyślij mailem do dostawcy.
- **Zmienne:** {clientName}
- **Załączniki domyślne:** brak

**Temat:** Zamówienie tkaniny — {clientName}

**Treść:**

> Dzień dobry,
>
> W załączeniu przesyłam zamówienie tkaniny.
>
> Proszę o potwierdzenie dostępności i terminu wysyłki.

---


## 2. Szablony tylko w bazie (treści nie ma w kodzie)

### Prośba o opinię — `template_id: opinia`
- **Gdzie używany:** CRM, karta deala → Obsługa posprzedażowa → Prośba o opinię (✉ Wyślij).
- **Zmienne:** {clientName}, {honorific}
- **Treść:** ⚠️ istnieje wyłącznie w bazie (w migracji 0057 tylko nadano wierszowi `template_id`, wcześniej nazywał się „Opinia - swobodna" / „Prośba o opinię"). Żeby ją zobaczyć: Poczta → Szablony w aplikacji.

### Instrukcja prania i czyszczenia — `template_id: instrukcja_prania`
- **Gdzie używany:** CRM, karta deala → Obsługa posprzedażowa → Instrukcja prania (✉ Wyślij). Przy szablonie mogą być przypięte pliki (Storage).
- **Zmienne:** {clientName}, {honorific}
- **Treść:** ⚠️ jak wyżej, tylko w bazie.

> Mogę je dołączyć do tego dokumentu, jeśli wkleisz treść z aplikacji albo dasz mi dostęp do bazy (z tego środowiska go nie mam).

---

## 3. Teksty wpisane na stałe w kod

### 3a. Zlecenie szycia do szwalni — `src/components/ModalSewing.jsx`
**Temat:** Zlecenie szycia — {imię klienta}

> Dzień dobry,
>
> W załączeniu przesyłam zlecenie szycia.
>
> Proszę o potwierdzenie przyjęcia i terminu realizacji.

### 3b. Zamówienie zbiorcze tkaniny do producenta — `src/components/ScreenFabricBulk.jsx`
**Temat:** Zamówienie tkaniny — zbiorcze

> Dzień dobry,
>
> Proszę o realizację zamówienia z załącznika.
>
> Proszę wysłać na adres:
>
> {adres wybranej szwalni}

### 3c. Faktura — wysyłka przez „mailto" (ScreenInvoices.jsx, przycisk bez podłączonej skrzynki)
**Temat:** Faktura {numer}

> Dzień dobry,
>
> W załączeniu przesyłam fakturę nr {numer} na kwotę {kwota brutto}.
>
> Pozdrawiam serdecznie,
> Paulina Porter
> Porter Design

(Podpis pochodzi z `SELLER.signature` w `src/constants/data.js`.)

### 3d. Wycena uproszczona — domyślna treść z PDF (`src/lib/pdf.js`, linia ok. 690)
> Dzień dobry,
>
> W nawiązaniu do rozmowy / spotkania / przesłanych wymiarów, przesyłam w załączeniu PDF z uproszczoną, przybliżoną wyceną {Pana/Pani} zamówienia.
>
> Łączna orientacyjna wartość realizacji: {kwota} zł brutto
> (zaliczka 50% = {zaliczka} zł)
>
> Czas realizacji: ok. 4 tygodnie od akceptacji i wpłaty zaliczki w wysokości 50% wartości zamówienia.
>
> Chętnie przyjadę z wzornikami tkanin, aby dobrać kolor i fakturę do wnętrza.
>
> Koszt pomiaru z dojazdem wynosi 250 zł brutto i jest w całości odliczany od wartości zamówienia, jeśli przekracza ono 6 000 zł brutto.
>
> Pozdrawiam serdecznie,
> Paulina Porter
> Porter Design
> Tel.: {telefon}
> E-mail: {e-mail}

### 3e. Stare, wbudowane szablony wiadomości (`src/components/ProdCard.jsx` – `MAIL_TEMPLATES`, oraz `ScreenMail.jsx` – wersja skrócona)
Używane jako awaryjne/starsze; warto sprawdzić, czy jeszcze coś ich używa, bo część dubluje szablony systemowe.

**Oferta** (ProdCard.jsx) — temat: `Oferta aranżacji okiennych – {clientName}`

> Dzień dobry,
>
> W nawiązaniu do naszej rozmowy, przesyłam w załączeniu PDF z przybliżoną wyceną {Pana/Pani} zamówienia.
>
> Orientacyjna wartość realizacji: {total} zł brutto
> (zaliczka 50% = {zaliczka} zł)
>
> Czas realizacji: ok. 4 tygodnie od akceptacji i wpłaty zaliczki.
>
> Chętnie przyjadę z wzornikami tkanin.
> Koszt pomiaru z dojazdem: 250 PLN (odliczane od wartości zamówienia).

**Potwierdzenie** (ProdCard.jsx) — temat: `Potwierdzenie zamówienia – {brand}`

> Dzień dobry,
>
> Dziękuję za wpłatę zaliczki. Potwierdzam przyjęcie {Pana/Pani} zamówienia do realizacji.
>
> Szacowany czas realizacji: ok. 4 tygodnie.
> O postępach będę informować na bieżąco.

**Przypomnienie** (ProdCard.jsx) — temat: `Przypomnienie – wycena {brand}`

> Dzień dobry,
>
> Pozwalam sobie przypomnieć o przesłanej wycenie. Oferta ważna jest przez 30 dni.
>
> Jeśli ma {Pan/Pani} pytania lub życzenia zmian — chętnie porozmawiam.

**Wersje skrócone w ScreenMail.jsx:**
- Oferta — temat `Oferta – {clientName}`: „Dzień dobry, Przesyłam wycenę {Pana/Pani} zamówienia. Wartość: {total} zł. Zaliczka 50%: {zaliczka} zł"
- Potwierdzenie — temat `Potwierdzenie zamówienia`: „Dzień dobry, Potwierdzam zamówienie."
- Przypomnienie — temat `Przypomnienie – wycena`: „Dzień dobry, Przypominam o wycenie. Oferta ważna 30 dni."

---

## 4. Maile techniczne (niewysyłane do klientów)

### Powiadomienie o prośbie o demo / test — `api/lead.js` (Resend, do właściciela)
**Temat:** `Prośba o demo: {imię}` lub `Prośba o test: {imię} — {studio}`

Nagłówek maila: „Prośba o demo" albo „Prośba o darmowy test (14 dni)". Treść: lista pól — Imię i nazwisko, E-mail, Studio, Miasto, Telefon, WWW / Instagram, Wiadomość. To HTML z tabelą (ciemny nagłówek `#1a1a2e`), edycja tylko w kodzie.
