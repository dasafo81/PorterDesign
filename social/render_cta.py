"""Jednorazowy końcowy slajd CTA (1080x1350) do dodania na końcu każdej karuzeli.
Uruchom: CHROMIUM_PATH=... python3 social/render_cta.py  ->  social/out/cta.png"""
import os
from PIL import Image
from playwright.sync_api import sync_playwright
from render import ROOT, PUB, OUT

SS = 2
tmp = OUT / '_cta_logo.png'
logo = Image.open(PUB / 'logo-mydecolab.png').convert('RGBA')
r, g, b, a = logo.split()
Image.merge('RGBA', (r.point(lambda v: 255), g.point(lambda v: 255), b.point(lambda v: 255), a)).save(tmp)  # białe logo na ciemne tło

HTML = f"""<!doctype html><html><head><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&family=DM+Sans:wght@300;500&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:'DM Sans',sans-serif;color:#fff;
 background:linear-gradient(165deg,#1c2233 0%,#232a3f 55%,#2b2a3a 100%)}}
.glow{{position:absolute;left:50%;top:-260px;transform:translateX(-50%);width:1300px;height:900px;background:radial-gradient(ellipse at center,rgba(232,112,58,.34),transparent 68%)}}
.glow2{{position:absolute;left:-250px;bottom:-300px;width:900px;height:700px;background:radial-gradient(ellipse at center,rgba(240,165,58,.16),transparent 70%)}}
.wrap{{position:relative;height:100%;padding:90px 80px 80px;display:flex;flex-direction:column;align-items:center;text-align:center}}
.logo{{height:112px}}
.eyebrow{{margin-top:auto;font-size:23px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:#f2a273}}
h1{{font-family:'Jost',sans-serif;font-weight:700;font-size:96px;line-height:1.08;letter-spacing:-.025em;margin-top:30px}}
h1 em{{font-style:normal;font-weight:400;background:linear-gradient(105deg,#f2a273 15%,#ffd08a 90%);-webkit-background-clip:text;background-clip:text;color:transparent}}
.sub{{font-size:31px;line-height:1.55;font-weight:300;color:rgba(255,255,255,.78);margin-top:34px;max-width:820px}}
.chips{{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:44px;max-width:900px}}
.chips span{{font-size:23px;font-weight:500;padding:11px 24px;border-radius:999px;border:1.5px solid rgba(242,162,115,.5);color:#ffd9bd;background:rgba(255,255,255,.04)}}
.btn{{margin-top:64px;padding:30px 64px;border-radius:20px;background:linear-gradient(105deg,#e8703a,#f0a53a);font-family:'Jost',sans-serif;font-weight:700;font-size:40px;color:#1c2233;letter-spacing:.01em;box-shadow:0 18px 50px rgba(232,112,58,.35)}}
.url{{margin-top:34px;font-size:34px;font-weight:500;letter-spacing:.06em;color:#fff}}
.bio{{margin-top:10px;font-size:24px;color:rgba(255,255,255,.55);letter-spacing:.05em}}
.spacer{{margin-bottom:auto}}
</style></head><body><div class=glow></div><div class=glow2></div><div class=wrap>
<img class=logo src="file://{tmp}">
<p class=eyebrow>Dla studiów dekoracji okien</p>
<h1>Czas na porządek<br><em>w całym studiu</em></h1>
<p class=sub>Wyceny, CRM, kalendarz, poczta i faktury z KSeF w jednym miejscu. Przetestuj My DecoLab za darmo.</p>
<div class=chips><span>Wyceny</span><span>CRM</span><span>Kalendarz</span><span>Poczta</span><span>Faktury z KSeF</span></div>
<div class=btn>Poproś o darmowy test (14 dni)</div>
<p class=url>mydecolab.pl</p>
<p class="bio spacer">link w bio</p>
</div></body></html>"""

def main():
    f = OUT / 'cta.html'
    f.write_text(HTML, encoding='utf-8')
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
        pg = b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=SS)
        pg.goto(f'file://{f}', wait_until='networkidle'); pg.evaluate('document.fonts.ready')
        raw = OUT / 'cta.raw.png'; pg.screenshot(path=str(raw)); b.close()
    Image.open(raw).convert('RGB').resize((1080, 1350), Image.LANCZOS).save(OUT / 'cta.png', optimize=True)
    raw.unlink(); f.unlink(); tmp.unlink()
    print('ok', OUT / 'cta.png')

if __name__ == '__main__':
    main()
