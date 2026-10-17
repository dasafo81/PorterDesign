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

rooms = Image.open(SRC / 'wyceny-pomieszczenia.png')
okna = Image.open(SRC / 'wyceny-okna.png')
pdf = Image.open(SRC / 'wyceny-pdf.png')

pomieszczenia = join(rooms, 20, 1175, 900, 1700, x0=6, x1=1970)
okna_j = join(okna, 0, 674, 760, 1740, x0=8, x1=1975)
pdf_j = join(pdf, 70, 870, 700, 1560, x0=100, x1=1812)

def full(img): return (0, 0, img.width, img.height)

SLIDES = [
  ('wyceny-1', roleta, (18, 12, 1968, 1177), 940, 'Wyceny', 'Wycena zlecenia<br><em>w kilka minut</em>',
   'Dodajesz pomieszczenia i okna, wybierasz produkty — cena z marżą liczy się sama, bez arkuszy i kalkulatora.'),
  ('wyceny-2', pomieszczenia, full(pomieszczenia), 700, 'Krok 1 · pomieszczenia', 'Dodajesz pomieszczenia<br><em>jedno po drugim</em>',
   'Salon, sypialnia, pokój dziecka, gabinet — każde pomieszczenie z liczbą okien i sumą. Możesz je kopiować i robić warianty.'),
  ('wyceny-3', okna_j, full(okna_j), 940, 'Krok 2 · okna', 'W każdym pomieszczeniu<br><em>dodajesz okna</em>',
   'Okno lewe, okno balkonowe, kolejne — każde z własnym produktem i ceną. Okno możesz skopiować albo przygotować jego wariant.'),
  ('wyceny-4', roleta, (50, 110, 1000, 700), 940, 'Krok 3 · produkt i wymiary', 'Wybierasz produkt<br><em>i wpisujesz wymiary</em>',
   'Zasłony, firany, żaluzje, rolety, karnisze i własny cennik w jednym konfiguratorze. Tkaninę wybierasz z katalogu.'),
  ('wyceny-5', szcz, (20, 0, 1000, 640), 940, 'Krok 4 · model i szczegóły', 'Model, układ<br><em>i marszczenie</em>',
   'Fałda, Wave albo taśma marszcząca, układ zasłony, procent marszczenia i odstęp między ślizgami — każdy wybór od razu przelicza cenę.'),
  ('wyceny-6', cena, full(cena), 940, 'Cena', 'Cena z marżą<br><em>liczy się sama</em>',
   'Wycena od razu w gotowej kwocie, z możliwością wpisania własnej ceny końcowej.'),
  ('wyceny-7', pdf_j, full(pdf_j), 700, 'Oferta dla klienta', 'Jedno kliknięcie<br><em>i oferta w PDF</em>',
   'Sam decydujesz, co klient zobaczy: wycenę szczegółową albo uproszczoną — z logo studia, pomieszczeniami i sumami.'),
]

if __name__ == '__main__':
    main(SLIDES)
