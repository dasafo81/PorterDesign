"""Karuzela „Faktury” (5 slajdów 1080x1350) ze zrzutów w social/src/faktury-*.png oraz deal-card.png.
Uruchom: CHROMIUM_PATH=... python3 social/render_faktury.py"""
from PIL import Image
from render_carousel import SRC, main

lista = Image.open(SRC / 'faktury-lista.png')
nowa = Image.open(SRC / 'faktury-nowa.png')
deal = Image.open(SRC / 'deal-card.png')

BG = (237, 238, 243)  # tło stron aplikacji

def join(img, y0, y1, x_left_end, x_right_start, x0, x1):
    """Skleja lewy i prawy fragment wiersza, pomijając pusty środek."""
    l = img.crop((x0, y0, x_left_end, y1)); r = img.crop((x_right_start, y0, x1, y1))
    out = Image.new('RGB', (l.width + r.width, y1 - y0))
    out.paste(l, (0, 0)); out.paste(r, (l.width, 0))
    return out

def stack(parts, gap=16, bg=BG):
    w = max(p.width for p in parts)
    out = Image.new('RGB', (w, sum(p.height for p in parts) + gap * (len(parts) - 1)), bg)
    y = 0
    for p in parts:
        out.paste(p, (0, y)); y += p.height + gap
    return out

def full(img): return (0, 0, img.width, img.height)

# 2) zestawienia: kafelki 2x2 + okresy + pasek narzędzi
zestawienia = stack([
    lista.crop((14, 48, 968, 182)), lista.crop((986, 48, 1940, 182)),
    lista.crop((14, 200, 1040, 256)), lista.crop((14, 266, 960, 330)), lista.crop((972, 266, 1440, 330)),
], gap=18, bg=lista.getpixel((5, 5)))

# 3) statusy: prawa część tabeli z rozwiniętą listą statusów
statusy = lista.crop((1200, 410, 1940, 900))

# 4) nowa faktura: kierunek/typ + dostawca/zlecenie/NIP
nowa_j = stack([
    join(nowa, 230, 410, 930, 1420, 35, 1832),
    join(nowa, 1040, 1445, 930, 1420, 35, 1832),
], gap=24, bg=nowa.getpixel((5, 5)))

# 5) pod jednym dealem: rozliczenie z klientem + ekonomia zlecenia
deal_j = stack([deal.crop((697, 232, 1327, 640)), deal.crop((44, 652, 674, 1046))], gap=18, bg=deal.getpixel((690, 250)))

SLIDES = [
  ('faktury-1', lista, (0, 8, 1950, 1240), 940, 'Faktury', 'Faktury i księgowość<br><em>w jednym miejscu</em>',
   'Faktury sprzedażowe i kosztowe, KSeF, statusy, zestawienia i wyszukiwanie — wszystko w tej samej aplikacji co wyceny i CRM.'),
  ('faktury-2', zestawienia, full(zestawienia), 940, 'Zestawienia i filtry', 'Cała sprzedaż<br><em>na pierwszy rzut oka</em>',
   'Dziś, 7 dni, miesiąc i rok — z kwotami i liczbą dokumentów. Okres listy zmieniasz jednym kliknięciem, dokumenty wyszukasz po numerze, nabywcy lub NIP.'),
  ('faktury-3', statusy, full(statusy), 740, 'Statusy i oznaczenia', 'Każda faktura<br><em>pod kontrolą</em>',
   'Wystawiona, wysłana, częściowo opłacona, opłacona, odrzucona — status zmieniasz z listy. Przeterminowane dokumenty są od razu podświetlone.'),
  ('faktury-4', nowa_j, full(nowa_j), 940, 'Nowa faktura', 'Sprzedaż i koszty<br><em>przypisane do zleceń</em>',
   'Fakturę wystawiasz albo rejestrujesz w kilka chwil, dane dostawcy pobierasz po NIP z GUS, a koszt przypisujesz do konkretnego zlecenia.'),
  ('faktury-5', deal_j, full(deal_j), 540, 'Pełna kontrola', 'Pod jednym dealem:<br><em>koszty, przychody, marża</em>',
   'Faktury przypisane do zlecenia składają się w jedno rozliczenie: ile zafakturowano, ile wpłynęło i jaka została marża.'),
]

if __name__ == '__main__':
    main(SLIDES)
