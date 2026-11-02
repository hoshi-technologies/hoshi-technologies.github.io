"""Fabrique les icônes 64 x 64 des succès (version obtenue + version grisée) par le code : aucune image générée par IA.
Usage : python steam/fabriquer_icones_succes.py   (nécessite Pillow)"""
import os, re
from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ICI, "..", "simulation", "Succes", "Succes.cs")
SIGLES = {"PREMIERE_RUE": "1", "PREMIER_PONT": "∩", "PALIER_BOURG": "B", "PALIER_VILLAGE": "V", "PALIER_PETITE_VILLE": "PV",
          "PALIER_VILLE": "VI", "PALIER_GRANDE_VILLE": "GV", "RESEAUX_OK": "≈", "PLEIN_EMPLOI": "%", "BUDGET_SAIN": "€$",
          "VILLE_REELLE_10_ANS": "10", "REELU": "✓", "PROMESSES_TENUES": "3", "OBJECTIF_ATTEINT": "★", "CINQUANTE_ANS": "50"}
COULEURS = [(52, 120, 186), (60, 150, 100), (196, 140, 40), (170, 70, 70), (120, 90, 170)]

def police(t):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
        if os.path.exists(f): return ImageFont.truetype(f, t)
    return ImageFont.load_default()

ids = re.findall(r'new\("([A-Z_0-9]+)", "', open(SRC, encoding="utf-8").read())
sortie = os.path.join(ICI, "icones_succes"); os.makedirs(sortie, exist_ok=True)
for i, ident in enumerate(ids):
    c = COULEURS[i % len(COULEURS)]
    im = Image.new("RGB", (64, 64), (24, 28, 36)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((3, 3, 60, 60), 12, fill=c, outline=(240, 230, 200), width=3)
    s = SIGLES.get(ident, ident[0]); f = police(30 if len(s) == 1 else 22)
    l, t, r, b = d.textbbox((0, 0), s, font=f)
    d.text(((64 - (r - l)) / 2 - l, (64 - (b - t)) / 2 - t), s, font=f, fill=(255, 255, 255))
    im.save(os.path.join(sortie, f"{ident}.png"))
    im.convert("L").point(lambda v: v // 2 + 30).convert("RGB").save(os.path.join(sortie, f"{ident}_gris.png"))
print(f"{len(ids)} icônes dans {sortie}")
