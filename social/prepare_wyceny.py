"""Przygotowuje zrzuty do karuzeli „Wyceny”: usuwa imię z nazwy pomieszczenia i naprawia puste ikonki (brakujący glif) na przyciskach „Wariant”.
Użycie: python3 social/prepare_wyceny.py <pomieszczenia.webp> <okna.webp> <pdf.png> <katalog_czcionek>
Wynik: social/src/wyceny-pomieszczenia.png, wyceny-okna.png, wyceny-pdf.png"""
import sys, pathlib, shutil
from PIL import Image
import imgedit
from imgedit import Editor

rooms_src, windows_src, pdf_src, fontdir = sys.argv[1:5]
imgedit.FONTDIR = fontdir
out = pathlib.Path(__file__).resolve().parent / 'src'

# pomieszczenia: „Pokój Jasia” -> „Pokój syna”; ołówek przesuwamy do końca nowego napisu
e = Editor(rooms_src)
pencil = e.im.crop((457, 414, 494, 448))
bb = e.replace((300, 412, 458, 450), 'Pokój Jasia', 'Pokój syna', 500, thr=80)
for y in range(412, 452):
    a, b = e.px[452, y], e.px[520, y]
    for x in range(454, 520):
        t = (x - 452) / (520 - 452)
        e.px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
end = bb[0] + imgedit.font(500, imgedit.fit('Pokój Jasia', bb[2] - bb[0], 500)).getlength('Pokój syna')
e.im.paste(pencil, (round(end + 20), 414))
e.finish(out / 'wyceny-pomieszczenia.png')

# okna: puste kwadraciki przy „Wariant” (brak glifu emoji na zrzucie) -> sam napis, rozmiar z sąsiedniego przycisku „Marszczenie”
w = Editor(windows_src)
size = imgedit.fit('Marszczenie', 107, 700)
f = imgedit.font(700, size)
for box in ((1822, 108, 1928, 138), (1846, 364, 1944, 390)):
    bb, _, bg = w.ink(box, 90)
    # kolor tekstu: mediana wyraźnie ciemnych pikseli części z napisem (bez kwadracika)
    pts = [w.px[x, y] for x in range(bb[0] + 20, bb[2]) for y in range(bb[1], bb[3])]
    dark = sorted(pts, key=sum)[:max(8, len(pts) // 12)]
    col = tuple(sorted(p[i] for p in dark)[len(dark) // 2] for i in range(3))
    w.erase(bb)
    w.layer.append(('Wariant', (bb[0] + bb[2]) / 2 - f.getlength('Wariant') / 2, bb[3], f, col))
w.finish(out / 'wyceny-okna.png')

shutil.copy(pdf_src, out / 'wyceny-pdf.png')
