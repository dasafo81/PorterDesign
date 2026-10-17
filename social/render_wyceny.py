"""Karuzela „Wyceny” (5 slajdów 1080x1350) ze zrzutów konfiguratora wyceny w social/src/wyceny-*.png.
Uruchom: CHROMIUM_PATH=... python3 social/render_wyceny.py"""
from PIL import Image
from render_carousel import SRC, main

firana = Image.open(SRC / 'wyceny-firana.png')
szcz = Image.open(SRC / 'wyceny-szczegoly.png')
roleta = Image.open(SRC / 'wyceny-roleta.png')

def join(img, y0, y1, x_left_end, x_right_start, x0=20, x1=1970):
    """Skleja lewy i prawy fragment wiersza, pomijając pusty środek (tło jest jednolite, szwu nie widać)."""
    l = img.crop((x0, y0, x_left_end, y1)); r = img.crop((x_right_start, y0, x1, y1))
    out = Image.new('RGB', (l.width + r.width, y1 - y0))
    out.paste(l, (0, 0)); out.paste(r, (l.width, 0))
    return out

cena = join(szcz, 1030, 1306, 700, 1620)

SLIDES = [
  ('wyceny-1', roleta, (18, 12, 1968, 1177), 940, 'Wyceny', 'Wycena zlecenia<br><em>w kilka minut</em>',
   'Wybierasz produkt i wpisujesz wymiary — cena z marżą liczy się sama, bez arkuszy i kalkulatora.'),
  ('wyceny-2', roleta, (50, 110, 1000, 700), 940, 'Krok 1 · produkt i wymiary', 'Wybierasz produkt<br><em>i wpisujesz wymiary</em>',
   'Zasłony, firany, żaluzje, rolety, karnisze i własny cennik w jednym konfiguratorze. Tkaninę wybierasz z katalogu.'),
  ('wyceny-3', szcz, (20, 0, 1000, 640), 940, 'Krok 2 · model i szczegóły', 'Model, układ<br><em>i marszczenie</em>',
   'Fałda, Wave albo taśma marszcząca, układ zasłony, procent marszczenia i odstęp między ślizgami — każdy wybór od razu przelicza cenę.'),
  ('wyceny-4', szcz, (20, 640, 1000, 1020), 940, 'Krok 3 · wykończenie i dodatki', 'Wykończenie<br><em>i dodatki</em>',
   'Typ dołu, rozmiar dołu, podszewka, ołów i taśma — opcje, o których łatwo zapomnieć przy wycenie, masz pod ręką.'),
  ('wyceny-5', cena, (0, 0, cena.width, cena.height), 940, 'Cena', 'Cena z marżą<br><em>liczy się sama</em>',
   'Wycena od razu w gotowej kwocie, z możliwością wpisania własnej ceny końcowej. Z wyceny: PDF, mail, zamówienie tkaniny i zlecenie szycia.'),
]

if __name__ == '__main__':
    main(SLIDES)
