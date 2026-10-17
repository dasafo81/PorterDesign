"""Podmienia dane osobowe na zrzutach karty deala na dane przykładowe (podmiana pikseli).
Użycie: python3 social/anonymize_deal_card.py <karta.webp> <modal_opinia.webp> <katalog_wyjscia> <katalog_czcionek>
Czcionki: mont400/500/600/700.ttf (Montserrat, Google Fonts). Współrzędne dotyczą zrzutów 2000 px szerokości."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

card_src, modal_src, outdir, fontdir = sys.argv[1:5]
os.makedirs(outdir, exist_ok=True)

def font(w, s): return ImageFont.truetype(f'{fontdir}/mont{w}.ttf', s)

def fit(text, width, weight):
    """Rozmiar czcionki, przy którym tekst ma zadaną szerokość."""
    lo, hi = 8.0, 80.0
    for _ in range(30):
        m = (lo + hi) / 2
        if font(weight, m).getlength(text) < width: lo = m
        else: hi = m
    return round(lo * 4) / 4

class Editor:
    def __init__(self, path):
        self.im = Image.open(path).convert('RGB')
        self.px = self.im.load()
        self.layer = []

    def ink(self, box, thr=60):
        """Ramka tekstu w prostokącie: piksele różniące się od tła (mediana) o więcej niż thr."""
        x0, y0, x1, y1 = box
        reg = self.im.crop(box)
        cols = [sorted(reg.getdata(b) for b in range(0))] if False else None
        px = reg.load()
        pts = [px[x, y] for x in range(reg.width) for y in range(reg.height)]
        bg = tuple(sorted(p[i] for p in pts)[len(pts) // 2] for i in range(3))
        xs, ys, best, bd = [], [], None, 0
        for y in range(reg.height):
            for x in range(reg.width):
                p = px[x, y]
                dd = sum(abs(p[i] - bg[i]) for i in range(3))
                if dd > thr:
                    xs.append(x); ys.append(y)
                    if dd > bd: bd, best = dd, p
        if not xs: raise SystemExit(f'brak tekstu w {box}')
        return (x0 + min(xs), y0 + min(ys), x0 + max(xs) + 1, y0 + max(ys) + 1), best, bg

    def erase(self, bb, pad=3):
        x0, y0, x1, y1 = bb
        xl, xr = max(x0 - pad - 1, 0), min(x1 + pad + 1, self.im.width - 1)
        for y in range(y0 - pad, y1 + pad):
            a, b = self.px[xl, y], self.px[xr, y]
            for x in range(x0 - pad, x1 + pad):
                t = (x - xl) / (xr - xl)
                self.px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

    def replace(self, box, old, new, weight, align='left', color=None, thr=60, pad=3):
        bb, col, _ = self.ink(box, thr)
        w = bb[2] - bb[0]
        size = fit(old, w, weight)
        f = font(weight, size)
        ob = f.getbbox(old, anchor='ls')
        baseline = bb[1] - ob[1]
        nw = f.getlength(new)
        if align == 'left': x = bb[0]
        elif align == 'right': x = bb[2] - nw
        else: x = (bb[0] + bb[2]) / 2 - nw / 2
        self.erase(bb, pad)
        self.layer.append((new, x, baseline, f, color or col))
        return bb

    def finish(self, path):
        big = 4
        lay = Image.new('RGBA', (self.im.width * big, self.im.height * big), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        for text, x, base, f, col in self.layer:
            fb = ImageFont.truetype(f.path, f.size * big)
            d.text((x * big, base * big), text, font=fb, fill=tuple(col) + (255,), anchor='ls')
        lay = lay.resize(self.im.size, Image.LANCZOS)
        out = Image.alpha_composite(self.im.convert('RGBA'), lay).convert('RGB')
        out.save(path)
        print('ok', path)
        return out

# ---------- karta deala ----------
c = Editor(card_src)
c.replace((40, 66, 260, 112), 'Pani Żaneta', 'Pani Anna', 700)
c.replace((78, 122, 178, 143), '504844189', '501234567', 500, pad=1)
c.replace((230, 121, 444, 143), 'zaneta.zanet@gmail.com', 'anna.kowal@mail.com', 500, pad=1)
c.replace((497, 121, 722, 143), 'ul. Ruczaj 46E/1, Warszawa', 'ul. Lipowa 12/4, Warszawa', 500, pad=1)
c.replace((60, 402, 330, 430), 'Gabinet p. Żaneta', 'Gabinet p. Anny', 400)
c.replace((60, 433, 330, 461), 'Gabinet p. Mąż', 'Gabinet p. Marka', 400)
c.replace((728, 328, 900, 354), 'EKO/5/10 · EKO', 'FV/5/10 · FV', 700)
c.replace((728, 355, 1120, 377), 'PD Porter Design Paulina Porter · 2026-10-09', 'Studio Dekoracji Anna Nowak · 2026-10-09', 400, thr=50)
c.replace((752, 912, 832, 937), 'Damian', 'Marcin', 600, pad=3)
c.replace((880, 912, 952, 937), 'Paulina', 'Joanna', 600, pad=3)
c.replace((736, 826, 900, 858), 'Piotr Skowroń', 'Marek Zieliński', 500)

# przycisk „→ KSeF” (w aplikacji pojawia się przy zwykłych fakturach VAT, przy dokumentach EKO go nie ma)
im, px = c.im, c.px
shift = 92
btn = im.crop((997, 377, 1115, 420))
bg = px[1000, 372]
for y in range(377, 420):
    for x in range(996, 1117): px[x, y] = bg
im.paste(btn, (997 - shift, 377))
# prostokąt przycisku KSeF – kopia obramowania Podglądu: rysujemy w 4x
sc = 4
bx0, by0, bx1, by1 = 1028, 380, 1112, 416
border = px[1002, 398] if False else (214, 218, 225)
fill = px[1010, 398]
tmp = Image.new('RGBA', (im.width * 0 + (bx1 - bx0 + 6) * sc, (by1 - by0 + 6) * sc), (0, 0, 0, 0))
dd = ImageDraw.Draw(tmp)
dd.rounded_rectangle((3 * sc, 3 * sc, (bx1 - bx0 + 3) * sc, (by1 - by0 + 3) * sc), radius=12 * sc, fill=tuple(fill) + (255,), outline=border + (255,), width=sc)
tmp = tmp.resize(((bx1 - bx0 + 6), (by1 - by0 + 6)), Image.LANCZOS)
im.paste(tmp, (bx0 - 3, by0 - 3), tmp)
fs = fit('Wyślij klientowi', 122, 700)
f = font(700, fs)
c.layer.append(('→ KSeF', (bx0 + bx1) / 2 - f.getlength('→ KSeF') / 2, 404, f, (28, 34, 51)))

card = c.finish(os.path.join(outdir, 'deal-card.png'))

# ---------- modal „Prośba o opinię” ----------
m = Editor(modal_src)
m.replace((672, 206, 1000, 236), 'zaneta.zanet@gmail.com', 'anna.kowal@mail.com', 400)
bb, _, _ = m.ink((672, 324, 940, 356), 60)
m.replace((672, 324, 940, 356), 'Drobna sprawa i wielka prośba', 'Prośba o opinię', 400)
# emoji z tematu
fieldbg = m.px[1200, 340]
for y in range(322, 360):
    for x in range(942, 985): m.px[x, y] = fieldbg
m.replace((724, 98, 1010, 120), 'Wysyłka z Twojej skrzynki (Outlook)', 'Wysyłka z Twojej skrzynki (Gmail)', 400, thr=40)

# treść wiadomości: biały obszar edytora
white = m.px[900, 700]
for y in range(472, 1096):
    for x in range(662, 1341): m.px[x, y] = white
hand = Image.open(modal_src).convert('RGB').crop((678, 898, 700, 920))
body_font = font(400, fit('Chciałabym bardzo podziękować za naszą współpracę, która była dla', 633, 400))
TXT = (17, 17, 17)
LINK = (0, 0, 238)
lines = [
 ('Dzień dobry,', None), ('', None),
 ('Dziękujemy za wspólną realizację — to była dla nas', None),
 ('prawdziwa przyjemność.', None),
 ('Będziemy bardzo wdzięczni za kilka słów opinii', None),
 ('o naszej współpracy. To zajmie tylko chwilę, a dla nas', None),
 ('jest to cenna wskazówka i ogromna pomoc w rozwoju.', None), ('', None),
 ('Wystarczy kliknąć w wybrany link:', None),
 ('Google: ', 'https://g.page/r/twoja-firma/review'),
 ('Facebook: ', 'https://facebook.com/twoja-firma/reviews'), ('', None),
 ('Z góry dziękujemy za Twój czas. Miłego dnia!', None), ('', None),
 ('Pozdrawiamy serdecznie,', None),
 ('Studio Dekoracji', None),
]
src_img = Image.open(modal_src).convert('RGB')
reg = src_img.crop((676, 488, 800, 515)); rp = reg.load()
top = min(yy for yy in range(reg.height) for xx in range(reg.width) if sum(rp[xx, yy]) < 300) + 488
baseline0 = top - body_font.getbbox('D', anchor='ls')[1]
lh = 31.5
unders = []
for i, (a, link) in enumerate(lines):
    b = baseline0 + i * lh
    if not link:
        if a: m.layer.append((a, 680, b, body_font, TXT))
        continue
    m.im.paste(hand, (680, int(b - 18)))
    m.layer.append((a, 703, b, body_font, TXT))
    lx = 703 + body_font.getlength(a)
    m.layer.append((link, lx, b, body_font, LINK))
    unders.append((lx, b + 3, lx + body_font.getlength(link)))

modal = m.finish(os.path.join(outdir, 'deal-opinie.png'))
d = ImageDraw.Draw(modal)
for x0, yy, x1 in unders:
    d.line((x0, yy, x1, yy), fill=LINK, width=1)
modal.save(os.path.join(outdir, 'deal-opinie.png'))
