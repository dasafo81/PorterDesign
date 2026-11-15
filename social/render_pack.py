"""Pakiet promocyjny: 2 nowe posty (1080x1350), Stories (1080x1920) i banery poziome (1200x630: OG/Facebook/LinkedIn/reklamy).
Wszystkie zrzuty pochodzą z public/ (te same, które są na landingu), logo z public/logo-mydecolab.png.
Uruchom: CHROMIUM_PATH=/opt/pw-browsers/chromium python3 social/render_pack.py [feed|stories|banners]
Wyniki: social/out/{08-magazyn,09-kontrahenci}.png, social/out/stories/*.png, social/out/banners/*.png"""
import os, sys, html, shutil
from PIL import Image
from playwright.sync_api import sync_playwright
from render import ROOT, PUB, OUT, CSS as FEED_CSS

SS = 2  # supersampling: render w 2x, potem LANCZOS do docelowego rozmiaru
TMP = OUT / '_pack'
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&family=DM+Sans:wght@300;500&display=swap" rel="stylesheet">'

# kadry (lewy, górny, prawy, dolny) w pikselach oryginałów 2000 px — bez paska bocznego aplikacji
CROPS = {
  'kanban':     ('crm-kanban.webp',        (264, 100, 1097, 735)),
  'wyceny':     ('wyceny-typ.webp',        (286, 45, 1380, 830)),
  'faktury':    ('faktury-ksef.webp',      (270, 150, 1960, 1124)),
  'kalendarz':  ('kalendarz.webp',         (262, 160, 1486, 1010)),
  'magazyn':    ('magazyn.webp',           (260, 0, 1626, 962)),
  'kontrahenci': ('kontrahenci.webp',      (430, 20, 1780, 988)),
}

import re
def nb(t):
    return re.sub(r'(?<![\w])([wziaouWZIAOU]) ', r'\1&nbsp;', t)

def crop(key):
    TMP.mkdir(parents=True, exist_ok=True)
    f, box = CROPS[key]
    out = TMP / f'{key}.png'
    Image.open(PUB / f).convert('RGB').crop(box).save(out)
    return out

def white_logo():
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / 'logo-white.png'
    r, g, b, a = Image.open(PUB / 'logo-mydecolab.png').convert('RGBA').split()
    Image.merge('RGBA', (r.point(lambda v: 255), g.point(lambda v: 255), b.point(lambda v: 255), a)).save(out)
    return out

# ───────────────────────── posty 1080x1350 (nowe moduły) ─────────────────────────
FEED = [
  ('08-magazyn', 'magazyn', 'Magazyn i katalog', 'Katalog tkanin<br><em>zawsze pod ręką</em>',
   'Tkaniny, ceny za metr i próbniki w jednym miejscu — materiał wybierasz prosto w wycenie.'),
  ('09-kontrahenci', 'kontrahenci', 'Kontrahenci', 'Klienci i dostawcy<br><em>w jednej bazie</em>',
   'Dane uzupełniane po NIP, gotowe do użycia w ofertach, zamówieniach i fakturach.'),
]

def feed_html(key, eyebrow, title, sub):
    return f"""<!doctype html><html><head><meta charset=utf-8>{FONTS}
<style>{FEED_CSS}.shot{{height:auto}}.shotin{{height:auto}}.shotin img{{width:100%;margin:0}}</style></head><body><div class=glow></div><div class=wrap>
<p class=eyebrow>{html.escape(eyebrow)}</p><h1>{nb(title)}</h1><p class=sub>{nb(html.escape(sub))}</p>
<div class=shot><div class=shotin><img src="file://{crop(key)}"></div></div>
<div class=foot><img src="file://{PUB/'logo-mydecolab.png'}"><span>mydecolab.pl</span></div>
</div></body></html>"""

# ───────────────────────── Stories 1080x1920 ─────────────────────────
# Instagram zasłania ok. 250 px u góry i u dołu — tekst i logo trzymamy w strefie bezpiecznej.
STORY_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1920px;font-family:'DM Sans',sans-serif;color:#1c2233;position:relative;overflow:hidden;
 background:linear-gradient(165deg,#eceef4 0%,#f6f4f1 40%,#f3ede5 100%)}
.glow{position:absolute;top:-260px;left:50%;transform:translateX(-50%);width:1300px;height:780px;background:radial-gradient(ellipse at center,rgba(232,112,58,.20),transparent 70%)}
.wrap{position:relative;height:100%;padding:250px 70px 250px;display:flex;flex-direction:column}
.eyebrow{font-size:24px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:#e8703a;margin-bottom:28px}
h1{font-family:'Jost',sans-serif;font-weight:700;font-size:92px;line-height:1.08;letter-spacing:-.025em}
h1 em{font-style:normal;font-weight:400;background:linear-gradient(105deg,#e8703a 20%,#f0a53a 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:33px;line-height:1.5;font-weight:300;color:#4d5568;margin-top:30px}
.shot{margin:auto 0;background:#e9edf2;border-radius:32px;padding:14px;box-shadow:0 44px 100px rgba(28,32,60,.30)}
.shot div{border-radius:22px;overflow:hidden}
.shot img{display:block;width:100%}
.foot{display:flex;align-items:center;justify-content:space-between}
.foot img{height:84px}
.foot span{font-size:28px;font-weight:500;color:#b45a12;letter-spacing:.04em}
"""

STORIES = [
  ('s01-calosc', 'kanban', 'Kompletne studio', 'Od pomiaru po fakturę<br><em>w jednym miejscu</em>',
   'Wyceny, CRM, kalendarz, poczta i faktury z KSeF.'),
  ('s02-wyceny', 'wyceny', 'Wyceny', '9 rodzajów produktów.<br><em>Pełna logika wyceny.</em>',
   'Zasłony, firany, żaluzje, rolety, plisy i karnisze — cena z marżą liczy się sama.'),
  ('s03-kalendarz', 'kalendarz', 'Kalendarz', 'Terminy ekip<br><em>zawsze aktualne</em>',
   'Pomiar, montaż i realizacja w kolorach — synchronizacja z Google i Outlookiem.'),
  ('s04-faktury', 'faktury', 'Faktury i KSeF', 'Zaliczka i faktura końcowa<br><em>wprost ze zlecenia</em>',
   'Faktury zgodne z KSeF, z danymi kontrahenta uzupełnianymi po NIP.'),
  ('s05-magazyn', 'magazyn', 'Magazyn i katalog', 'Katalog tkanin<br><em>zawsze pod ręką</em>',
   'Tkaniny, ceny za metr i próbniki — materiał wybierasz prosto w wycenie.'),
]

def story_html(key, eyebrow, title, sub):
    return f"""<!doctype html><html><head><meta charset=utf-8>{FONTS}<style>{STORY_CSS}</style></head><body><div class=glow></div><div class=wrap>
<p class=eyebrow>{html.escape(eyebrow)}</p><h1>{nb(title)}</h1><p class=sub>{nb(html.escape(sub))}</p>
<div class=shot><div><img src="file://{crop(key)}"></div></div>
<div class=foot><img src="file://{PUB/'logo-mydecolab.png'}"><span>mydecolab.pl</span></div>
</div></body></html>"""

def story_cta_html():
    return f"""<!doctype html><html><head><meta charset=utf-8>{FONTS}<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:1080px;height:1920px;position:relative;overflow:hidden;font-family:'DM Sans',sans-serif;color:#fff;
 background:linear-gradient(165deg,#1c2233 0%,#232a3f 55%,#2b2a3a 100%)}}
.glow{{position:absolute;left:50%;top:-240px;transform:translateX(-50%);width:1400px;height:1100px;background:radial-gradient(ellipse at center,rgba(232,112,58,.36),transparent 68%)}}
.glow2{{position:absolute;left:-260px;bottom:-280px;width:1000px;height:800px;background:radial-gradient(ellipse at center,rgba(240,165,58,.16),transparent 70%)}}
.wrap{{position:relative;height:100%;padding:250px 80px;display:flex;flex-direction:column;align-items:center;text-align:center}}
.logo{{height:130px}}
.eyebrow{{margin-top:auto;font-size:26px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:#f2a273}}
h1{{font-family:'Jost',sans-serif;font-weight:700;font-size:104px;line-height:1.08;letter-spacing:-.025em;margin-top:34px}}
h1 em{{font-style:normal;font-weight:400;background:linear-gradient(105deg,#f2a273 15%,#ffd08a 90%);-webkit-background-clip:text;background-clip:text;color:transparent}}
.sub{{font-size:34px;line-height:1.55;font-weight:300;color:rgba(255,255,255,.78);margin-top:38px;max-width:860px}}
.chips{{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:50px;max-width:920px}}
.chips span{{font-size:26px;font-weight:500;padding:13px 28px;border-radius:999px;border:1.5px solid rgba(242,162,115,.5);color:#ffd9bd;background:rgba(255,255,255,.04)}}
.btn{{margin-top:70px;padding:34px 70px;border-radius:22px;background:linear-gradient(105deg,#e8703a,#f0a53a);font-family:'Jost',sans-serif;font-weight:700;font-size:44px;color:#1c2233;box-shadow:0 18px 50px rgba(232,112,58,.35)}}
.url{{margin:38px 0 auto;font-size:38px;font-weight:500;letter-spacing:.06em}}
</style></head><body><div class=glow></div><div class=glow2></div><div class=wrap>
<img class=logo src="file://{white_logo()}">
<p class=eyebrow>Aplikacja rusza w styczniu</p>
<h1>Zacznij nowy rok<br>od porządku<br><em>w&nbsp;swojej pracowni</em></h1>
<p class=sub>Wyceny, klienci, kalendarz, poczta i faktury w jednym miejscu.</p>
<div class=chips><span>Wyceny</span><span>CRM</span><span>Kalendarz</span><span>Poczta</span><span>Faktury z KSeF</span></div>
<div class=btn>Poproś o darmowy test (14 dni)</div>
<p class=url>mydecolab.pl</p>
</div></body></html>"""

# ───────────────────────── banery poziome 1200x630 ─────────────────────────
BANNER_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1200px;height:630px;font-family:'DM Sans',sans-serif;color:#1c2233;position:relative;overflow:hidden;
 background:linear-gradient(160deg,#eceef4 0%,#f6f4f1 45%,#f3ede5 100%)}
.glow{position:absolute;top:-260px;left:-100px;width:900px;height:560px;background:radial-gradient(ellipse at center,rgba(232,112,58,.20),transparent 70%)}
.txt{position:absolute;left:64px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;padding:48px 0}
.eyebrow{font-size:15px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:#e8703a;margin-bottom:18px}
h1{font-family:'Jost',sans-serif;font-weight:700;font-size:50px;line-height:1.1;letter-spacing:-.025em}
h1 em{font-style:normal;font-weight:400;background:linear-gradient(105deg,#e8703a 20%,#f0a53a 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:21px;line-height:1.5;font-weight:300;color:#4d5568;margin-top:20px}
.foot{display:flex;align-items:center;gap:22px;margin-top:34px}
.foot img{height:54px}
.foot span{font-size:19px;font-weight:500;color:#b45a12;letter-spacing:.04em}
.card{position:absolute;right:-64px;top:50%;transform:translateY(-50%);width:620px;background:#e9edf2;border-radius:28px;padding:12px;box-shadow:0 30px 70px rgba(28,32,60,.28)}
.card div{border-radius:18px;overflow:hidden}
.card img{display:block;width:100%}
"""

BANNERS = [
  ('banner-calosc', 'kanban', 'Kompletne studio', 'Od pomiaru po fakturę<br><em>w jednym miejscu</em>',
   'Wyceny, CRM, kalendarz, poczta i faktury z KSeF.'),
  ('banner-wyceny', 'wyceny', 'Wyceny', '9 rodzajów produktów.<br><em>Pełna logika wyceny.</em>',
   'Zasłony, firany, żaluzje, rolety i karnisze — z marżą.'),
  ('banner-faktury', 'faktury', 'Faktury i KSeF', 'Faktura<br><em>wprost ze zlecenia</em>',
   'Zaliczka i faktura końcowa zgodne z KSeF.'),
]

def banner_html(key, eyebrow, title, sub):
    return f"""<!doctype html><html><head><meta charset=utf-8>{FONTS}<style>{BANNER_CSS}</style></head><body><div class=glow></div>
<div class=txt><p class=eyebrow>{html.escape(eyebrow)}</p><h1>{nb(title)}</h1><p class=sub>{nb(html.escape(sub))}</p>
<div class=foot><img src="file://{PUB/'logo-mydecolab.png'}"><span>mydecolab.pl</span></div></div>
<div class=card><div><img src="file://{crop(key)}"></div></div></body></html>"""

def banner_cta_html():
    return f"""<!doctype html><html><head><meta charset=utf-8>{FONTS}<style>{BANNER_CSS}
body{{color:#fff;background:linear-gradient(165deg,#1c2233 0%,#232a3f 55%,#2b2a3a 100%)}}
.glow{{background:radial-gradient(ellipse at center,rgba(232,112,58,.38),transparent 70%)}}
h1{{font-size:50px}}
h1 em{{background:linear-gradient(105deg,#f2a273 15%,#ffd08a 90%);-webkit-background-clip:text;background-clip:text}}
.eyebrow{{color:#f2a273}}
.sub{{color:rgba(255,255,255,.78)}}
.logo{{height:58px;margin-bottom:26px;align-self:flex-start}}
.btn{{align-self:flex-start;margin-top:30px;padding:16px 34px;border-radius:14px;background:linear-gradient(105deg,#e8703a,#f0a53a);font-family:'Jost',sans-serif;font-weight:700;font-size:23px;color:#1c2233;box-shadow:0 12px 34px rgba(232,112,58,.35)}}
.url{{margin-top:16px;font-size:19px;font-weight:500;letter-spacing:.06em;color:rgba(255,255,255,.8)}}
.card{{background:rgba(255,255,255,.10)}}
</style></head><body><div class=glow></div>
<div class=txt><img class=logo src="file://{white_logo()}"><p class=eyebrow>Aplikacja rusza w styczniu</p>
<h1>Zacznij nowy rok<br>od porządku<br><em>w&nbsp;swojej pracowni</em></h1>
<div class=btn>Poproś o darmowy test (14 dni)</div><p class=url>mydecolab.pl</p></div>
<div class=card><div><img src="file://{crop('kanban')}"></div></div></body></html>"""

# ───────────────────────── render ─────────────────────────
def shoot(browser, doc, size, dest):
    w, h = size
    pg = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=SS)
    f = TMP / 'page.html'
    f.write_text(doc, encoding='utf-8')
    pg.goto(f'file://{f}', wait_until='networkidle')
    pg.evaluate('document.fonts.ready')
    raw = TMP / 'raw.png'
    pg.screenshot(path=str(raw))
    pg.close()
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.open(raw).convert('RGB').resize((w, h), Image.LANCZOS).save(dest, optimize=True)
    print(dest.relative_to(ROOT))

def main(which):
    TMP.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
        if 'feed' in which:
            for name, key, ey, t, s in FEED:
                shoot(b, feed_html(key, ey, t, s), (1080, 1350), OUT / f'{name}.png')
        if 'stories' in which:
            for name, key, ey, t, s in STORIES:
                shoot(b, story_html(key, ey, t, s), (1080, 1920), OUT / 'stories' / f'{name}.png')
            shoot(b, story_cta_html(), (1080, 1920), OUT / 'stories' / 's06-cta.png')
        if 'banners' in which:
            for name, key, ey, t, s in BANNERS:
                shoot(b, banner_html(key, ey, t, s), (1200, 630), OUT / 'banners' / f'{name}.png')
            shoot(b, banner_cta_html(), (1200, 630), OUT / 'banners' / 'banner-cta.png')
        b.close()
    shutil.rmtree(TMP, ignore_errors=True)

if __name__ == '__main__':
    main(sys.argv[1:] or ['feed', 'stories', 'banners'])
