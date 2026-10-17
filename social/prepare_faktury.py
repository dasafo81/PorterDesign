"""Podmienia nazwy kontrahentów, NIP-y i numery faktur na zrzucie listy faktur (social/src/faktury-lista.png).
Użycie: python3 social/prepare_faktury.py <lista.webp> <nowa_faktura.png> <katalog_czcionek>"""
import sys, pathlib, shutil
import imgedit
from imgedit import Editor

lista, nowa, fontdir = sys.argv[1:4]
imgedit.FONTDIR = fontdir
out = pathlib.Path(__file__).resolve().parent / 'src'
e = Editor(lista)

# (rząd) numer faktury, linie nazwy kontrahenta, NIP — współrzędne zrzutu 2000 px
rows = [
  # numer, (stary numer, nowy), linie nazwy [(box, stara, nowa)], nip
  dict(num=((30, 474, 260, 502), 'FV/26/10/2', 'FV/26/10/2'),
       names=[((416, 478, 700, 502), 'NITECZKAMI BARBARA', 'HURTOWNIA TKANIN'), ((416, 504, 700, 527), 'JASIŃSKA', 'LUX SP. Z O.O.')],
       nip=((416, 527, 700, 549), 'NIP: 9710050779', 'NIP: 5252345671')),
  dict(num=((30, 578, 260, 606), 'FV/26/10/1', 'FV/26/10/1'),
       names=[((416, 582, 700, 606), 'NITECZKAMI BARBARA', 'HURTOWNIA TKANIN'), ((416, 608, 700, 631), 'JASIŃSKA', 'LUX SP. Z O.O.')],
       nip=((416, 631, 700, 653), 'NIP: 9710050779', 'NIP: 5252345671')),
  dict(num=((30, 683, 260, 711), '26100153160786', 'FV/10/2026/0153'),
       names=[((416, 685, 700, 709), 'Orange Polska S.A.', 'Telekom Biznes S.A.')],
       nip=((416, 709, 700, 733), 'NIP: 5260250995', 'NIP: 5262345671')),
  dict(num=((30, 763, 260, 791), 'FS/000052/10/2026', 'FS/000041/10/2026'),
       names=[((416, 765, 700, 790), 'Biuro Rachunkowe', 'Biuro Rachunkowe'), ((416, 790, 700, 814), 'INCREASE Sp. z o.o.', 'Księgowość Plus Sp. z o.o.')],
       nip=((416, 814, 700, 837), 'NIP: 5213761464', 'NIP: 5213456780')),
  dict(num=((30, 867, 260, 895), 'F 29142/4348/26', 'F 20417/3921/26'),
       names=[((416, 869, 700, 893), 'ORLEN S.A.', 'Paliwa Express S.A.')],
       nip=((416, 893, 700, 917), 'NIP: 7740001454', 'NIP: 7742345679')),
  dict(num=((30, 947, 260, 975), '26/10/FO/05617', '26/10/FO/04218'),
       names=[((416, 949, 700, 974), 'IMPULS-LEASING Polska', 'Leasing Auto Polska'), ((416, 974, 700, 998), 'Sp. z o.o.', 'Sp. z o.o.')],
       nip=((416, 997, 700, 1021), 'NIP: 5222836865', 'NIP: 5222456781')),
  dict(num=((30, 1051, 260, 1079), '1003638420', '1003412745'),
       names=[((416, 1053, 700, 1077), 'INPOST SP. Z O.O.', 'KURIER EXPRESS SP. Z O.O.')],
       nip=((416, 1077, 700, 1101), 'NIP: 6793108059', 'NIP: 6793456782')),
]
for r in rows:
    box, old, new = r['num']
    e.replace(box, old, new, 700, thr=80)
    for box, old, new in r['names']:
        e.replace(box, old, new, 500, thr=80)
    box, old, new = r['nip']
    e.replace(box, old, new, 400, thr=60)
e.finish(out / 'faktury-lista.png')
shutil.copy(nowa, out / 'faktury-nowa.png')
