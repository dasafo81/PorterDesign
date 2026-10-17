"""Karuzela na Instagram (5 slajdów 1080x1350) z karty deala. Najpierw: python3 social/anonymize_deal_card.py ...
Uruchom: CHROMIUM_PATH=... python3 social/render_carousel.py"""
import os, pathlib
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright
from render import ROOT, PUB, OUT, CSS

SRC = ROOT / 'social' / 'src'
TMP = ROOT / 'social' / 'out' / '_crop'
TMP.mkdir(parents=True, exist_ok=True)
SS = 2  # współczynnik supersamplingu: rendering w 2160x2700, potem zmniejszenie do 1080x1350

card = Image.open(SRC / 'deal-card.png')
modal = Image.open(SRC / 'deal-opinie.png')
invmail = Image.open(SRC / 'deal-faktura-mail.png')

# (plik, obraz, kadr, szerokość ramki w px, eyebrow, nagłówek, podtytuł)
SLIDES = [
  ('karuzela-1', card, (16, 20, 1330, 1028), 940, 'Karta deala', 'Cała realizacja<br><em>w jednej karcie</em>',
   'Wycena, rozliczenie z klientem, ekonomia zlecenia i terminy — wszystko, czego potrzebujesz przy zleceniu, pod ręką.'),
  ('karuzela-2', card, (697, 232, 1327, 640), 940, 'Faktury', 'Fakturę wyślesz mailem<br><em>i przekażesz do KSeF</em>',
   'Zaliczka, faktura końcowa, podgląd PDF, wysyłka do klienta i KSeF — prosto z karty zlecenia, bez przepisywania danych.'),
  ('karuzela-3', invmail, (636, 53, 1366, 1040), 540, 'Faktury', 'Mail z fakturą<br><em>gotowy w kilka sekund</em>',
   'Temat, treść i załącznik z fakturą uzupełniają się z szablonu — sprawdzasz i klikasz Wyślij.'),
  ('karuzela-4', card, (44, 652, 674, 1046), 940, 'Ekonomia zlecenia', 'Wiesz, ile zarabiasz<br><em>na zleceniu</em>',
   'Koszt tkaniny, szycia i osprzętu wyliczony z wyceny oraz marża na produkcji — zanim zamkniesz zlecenie.'),
  ('karuzela-5', card, (1350, 245, 1980, 730), 940, 'Realizacja i montaż', 'Terminy i etapy<br><em>zawsze pod kontrolą</em>',
   'Termin realizacji i montażu, etapy zamówienia (osprzęt, tkanina, szycie), spotkania i przypisanie ekipy w jednym miejscu.'),
  ('karuzela-6', modal, (636, 53, 1366, 850), 620, 'Opinie klientów', 'Prośbę o opinię<br><em>wysyłasz jednym kliknięciem</em>',
   'Gotowy mail z linkami do Google i Facebooka, wysyłany z Twojej skrzynki — Gmail, Outlook lub własnej.'),
]

EXTRA = """
.shot{margin:auto;height:auto;padding:14px}
.shot img{width:100%}
.shotin{height:auto}
.dots{display:flex;gap:12px;align-items:center}
.dots i{width:12px;height:12px;border-radius:50%;background:#d6d9e0}
.dots i.on{background:#e8703a;width:34px;border-radius:8px}
.foot{margin-top:40px}
.foot .cta{font-size:25px;font-weight:500;color:#b45a12;letter-spacing:.04em}
"""

def html(n, total, crop, width, eyebrow, title, sub):
    dots = ''.join(f'<i class="{"on" if i == n else ""}"></i>' for i in range(total))
    last = n == total - 1
    right = 'Darmowy test: mydecolab.pl' if last else 'mydecolab.pl'
    return f"""<!doctype html><html><head><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&family=DM+Sans:wght@300;500&display=swap" rel="stylesheet">
<style>{CSS}{EXTRA}</style></head><body><div class=glow></div><div class=wrap>
<p class=eyebrow>{eyebrow}</p><h1>{title}</h1><p class=sub>{sub}</p>
<div class=shot style="width:{width}px"><div class=shotin><img src="file://{crop}"></div></div>
<div class=foot><img src="file://{PUB/'logo-mydecolab.png'}"><div class=dots>{dots}</div><span>{right}</span></div>
</div></body></html>"""

def main(slides=None):
    slides = slides or SLIDES
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
        pg = b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=SS)
        for n, (name, img, box, width, ey, t, s) in enumerate(slides):
            crop = TMP / f'{name}.png'
            c = img.crop(box)
            # powiększenie z wyprzedzeniem (Lanczos) + lekkie wyostrzenie, zamiast skalowania w przeglądarce
            inner = (width - 28) * SS
            c = c.resize((inner, round(c.height * inner / c.width)), Image.LANCZOS)
            c = c.filter(ImageFilter.UnsharpMask(radius=2.2, percent=140, threshold=2))
            c.save(crop)
            f = OUT / f'{name}.html'
            f.write_text(html(n, len(slides), crop, width, ey, t, s), encoding='utf-8')
            pg.goto(f'file://{f}', wait_until='networkidle')
            pg.evaluate('document.fonts.ready')
            raw = OUT / f'{name}.raw.png'
            pg.screenshot(path=str(raw))
            Image.open(raw).convert('RGB').resize((1080, 1350), Image.LANCZOS).save(OUT / f'{name}.png', optimize=True)
            raw.unlink()
            f.unlink()
            print(name)
        b.close()

if __name__ == '__main__':
    main()
