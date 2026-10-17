"""Wspólne narzędzia do podmiany tekstu na zrzutach (Editor) — czcionka Montserrat jak w aplikacji."""
from PIL import Image, ImageDraw, ImageFont

FONTDIR = None  # katalog z mont400/500/600/700.ttf; ustaw przed użyciem

def font(w, s): return ImageFont.truetype(f'{FONTDIR}/mont{w}.ttf', s)

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
        nb = f.getbbox(new, anchor='ls')
        if align == 'left': x = bb[0] - nb[0]
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

