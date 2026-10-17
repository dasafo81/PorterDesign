"""Podmienia dane osobowe na zrzucie karty deala na dane przykładowe.
Użycie: python3 social/anonymize_deal_card.py <wejście.webp> <wyjście.webp> <katalog_z_Montserrat>
Czcionki: mont400/500/700.ttf (Montserrat, Google Fonts)."""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

src, dst, fontdir = sys.argv[1:4]
im = Image.open(src).convert('RGB')
px = im.load()
F = lambda w, s: ImageFont.truetype(f'{fontdir}/mont{w}.ttf', s)

def fit(text, width, weight):
    """Rozmiar czcionki, przy którym oryginalny tekst ma zadaną szerokość."""
    lo, hi = 8.0, 80.0
    for _ in range(30):
        m = (lo + hi) / 2
        if F(weight, m).getlength(text) < width: lo = m
        else: hi = m
    return round(lo * 4) / 4

def font(w, s): return ImageFont.truetype(f'{fontdir}/mont{w}.ttf', s)

def erase_rows(x0, y0, x1, y1, xl, xr):
    """Zamazuje prostokąt tłem z interpolacji poziomej między kolumnami xl i xr (osobno dla każdego wiersza)."""
    for y in range(y0, y1):
        a, b = px[xl, y], px[xr, y]
        for x in range(x0, x1):
            t = (x - xl) / (xr - xl)
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
d = ImageDraw.Draw(layer)

def put(text, x, baseline, f, color, anchor='ls'):
    d.text((x, baseline), text, font=f, fill=color + (255,), anchor=anchor)

WHITE = (250, 250, 252)

# nagłówek: imię i nazwisko (baseline 105 – tekst bez ogonków)
erase_rows(40, 68, 445, 114, 30, 470)
fs = fit('Reanata Franke TKANINY', 385, 700)
put('Tomasz Jankowski', 45, 102, font(700, fs), WHITE)

# chip telefon
erase_rows(80, 124, 178, 146, 79, 179)
fs = fit('606 961 979', 91, 500)
put('601 234 567', 81, 140, font(500, fs), WHITE)

# chip adres
erase_rows(396, 124, 646, 146, 395, 647)
fs = fit('ul. Pod Dębami 22/1 Warszawa', 241, 500)
put('ul. Pod Lipami 14/3 Warszawa', 398, 140, font(500, fs), WHITE)

# przyciski faktur
BTN = px[1000, 380]
def btn_text(x0, x1, y0, y1, icon_box, lines, base_y, fsz):
    """Zamazuje tekst przycisku, zostawia ikonkę i rysuje nowy tekst wyśrodkowany razem z ikonką."""
    icon = im.crop(icon_box)
    for y in range(y0, y1):
        for x in range(x0, x1): px[x, y] = BTN
    f = font(700, fsz)
    first = lines[0]
    iw = icon.width + 7
    tw = f.getlength(first)
    left = (709 + 1292) / 2 - (iw + tw) / 2
    return icon, left, iw, f

# przycisk 1 (środek: 709..1292, 374..419)
icon1 = im.crop((758, 385, 775, 410))
fs = fit('Wystaw fakturę 50% — PD Porter Design Paulina Porter', 464, 700)
for y in range(380, 414):
    for x in range(712, 1289): px[x, y] = BTN
f = font(700, fs)
t1 = 'Wystaw fakturę 50% — Studio Dekoracji Anna Nowak'
left = 1000.5 - (icon1.width + 7 + f.getlength(t1)) / 2
im.paste(icon1, (round(left), 385))
put(t1, left + icon1.width + 7, 402, f, WHITE)

# przycisk 2 – dwie linie (zw. VAT)
icon2 = im.crop((739, 440, 756, 460))
for y in range(433, 487):
    for x in range(712, 1289): px[x, y] = BTN
t2a = 'Wystaw fakturę 50% — Studio Dekoracji Jan Nowak'
left = 1000.5 - (icon2.width + 7 + f.getlength(t2a)) / 2
im.paste(icon2, (round(left), 441))
put(t2a, left + icon2.width + 7, 457, f, WHITE)
put('(zw. VAT)', 1000.5, 478, f, WHITE, anchor='ms')

layer = layer.filter(ImageFilter.GaussianBlur(0.45))
im = Image.alpha_composite(im.convert('RGBA'), layer).convert('RGB')
im.save(dst, quality=92)
print('ok', dst)
