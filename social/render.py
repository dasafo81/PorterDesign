"""Generuje posty na Instagram (1080x1350) ze zrzutów w public/. Uruchom: python3 social/render.py"""
import pathlib, html
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
SRC = ROOT / 'social' / 'src'  # zrzuty, które mają pierwszeństwo przed public/
OUT = ROOT / 'social' / 'out'
OUT.mkdir(exist_ok=True)

POSTS = [
  ('01-calosc', 'crm-kanban.webp', 'Kompletne studio', 'Od pomiaru po fakturę — <em>w jednym miejscu</em>', 'Wyceny, CRM, kalendarz, poczta i faktury z KSeF. Bez przełączania się między programami.'),
  ('02-wyceny', 'wyceny-wymiary.webp', 'Wyceny', 'Wpisujesz wymiary. <em>Cena liczy się sama.</em>', 'Zasłony, firany, żaluzje, rolety i karnisze — z marżą, bez arkuszy i kalkulatora.'),
  ('03-pdf', 'wyceny-podsumowanie.webp', 'Oferty', 'Oferta w PDF <em>jednym kliknięciem</em>', 'Z logo studia, wycena szczegółowa lub uproszczona, mail do klienta i zlecenie szycia.'),
  ('04-kalendarz', 'kalendarz.webp', 'Kalendarz', 'Pomiar, montaż, realizacja — <em>osobno dla każdej ekipy</em>', 'Terminy w kolorach i synchronizacja z Kalendarzem Google i Outlookiem.'),
  ('05-poczta', 'mail.webp', 'Poczta', 'Gmail, Outlook <em>albo każda inna skrzynka</em>', 'Wysyłasz oferty z własnego adresu i śledzisz korespondencję z klientem — bez wychodzenia z aplikacji.'),
  ('06-faktury', 'faktury-ksef.webp', 'Faktury i KSeF', 'Zaliczka i faktura końcowa <em>wprost ze zlecenia</em>', 'Faktury zgodne z KSeF, z danymi kontrahenta uzupełnianymi po NIP.'),
  ('07-ai', 'ai.webp', 'Asystent AI', 'Wklejasz maila od klienta. <em>Reszta dzieje się sama.</em>', 'Asystent przygotowuje klienta z pokojami i produktami, dopytuje o braki i wylicza wycenę.'),
]

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;font-family:'DM Sans',sans-serif;color:#1c2233;position:relative;overflow:hidden;
 background:linear-gradient(160deg,#eceef4 0%,#f6f4f1 38%,#f3ede5 100%)}
.glow{position:absolute;top:-220px;left:50%;transform:translateX(-50%);width:1100px;height:600px;background:radial-gradient(ellipse at center,rgba(232,112,58,.17),transparent 70%)}
.wrap{position:relative;height:100%;padding:76px 70px 64px;display:flex;flex-direction:column}
.eyebrow{font-size:22px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:#e8703a;margin-bottom:26px}
h1{font-family:'Jost',sans-serif;font-weight:700;font-size:78px;line-height:1.1;letter-spacing:-.02em}
h1 em{font-style:normal;font-weight:400;background:linear-gradient(105deg,#e8703a 20%,#f0a53a 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:29px;line-height:1.5;font-weight:300;color:#4d5568;margin-top:28px;max-width:900px}
.shot{margin-top:auto;background:#e9edf2;border-radius:30px;padding:14px;box-shadow:0 40px 90px rgba(28,32,60,.28)}
.shot{height:700px;overflow:hidden}
.shot img{display:block;max-width:none}
.shotin{height:100%;overflow:hidden;border-radius:20px}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:44px}
.foot img{height:78px}
.foot span{font-size:25px;font-weight:500;color:#b45a12;letter-spacing:.04em}
"""

def page(img, eyebrow, title, sub):
    full = img == 'ai.webp'  # modal na przyciemnionym tle: cały kadr
    imgstyle = 'width:100%' if full else 'width:1290px;margin-left:-168px'
    shotstyle = 'height:auto' if full else ''
    return f"""<!doctype html><html><head><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&family=DM+Sans:wght@300;500&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class=glow></div><div class=wrap>
<p class=eyebrow>{html.escape(eyebrow)}</p><h1>{title}</h1><p class=sub>{html.escape(sub)}</p>
<div class=shot style="{shotstyle}"><div class=shotin><img style="{imgstyle}" src="file://{(SRC/img) if (SRC/img).exists() else (PUB/img)}"></div></div>
<div class=foot><img src="file://{PUB/'logo-mydecolab.png'}"><span>mydecolab.pl</span></div>
</div></body></html>"""

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH') or None)
        pg = b.new_page(viewport={'width':1080,'height':1350})
        for name, img, ey, t, s in POSTS:
            f = OUT / f'{name}.html'
            f.write_text(page(img, ey, t, s), encoding='utf-8')
            pg.goto(f'file://{f}', wait_until='networkidle')
            pg.evaluate('document.fonts.ready')
            pg.screenshot(path=str(OUT / f'{name}.png'))
            f.unlink()
            print(name)
        b.close()


if __name__ == '__main__':
    main()
