"""Dessine une image de contrôle (vue du dessus) d'un paquet de ville, pour la vérification humaine.
Usage : python apercu.py dossier_du_paquet [largeur_px]"""
import gzip, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

COUL_SOL = {"park": (176, 214, 150), "forest": (140, 190, 125), "wood": (140, 190, 125), "grass": (190, 222, 160),
            "meadow": (196, 224, 165), "farmland": (226, 222, 170), "cemetery": (180, 205, 170),
            "residential": (232, 226, 220), "commercial": (238, 214, 214), "retail": (238, 214, 214),
            "industrial": (226, 214, 232), "recreation_ground": (190, 222, 160), "pitch": (170, 214, 160)}
GAB = {"voie_rapide": (6, (230, 140, 70)), "avenue": (4, (245, 200, 90)), "rue": (2, (255, 255, 255)),
       "desserte": (1, (250, 250, 250)), "pieton": (1, (205, 190, 180)), "rail": (2, (110, 110, 120))}


def police(taille=14):
    for nom in ("DejaVuSans.ttf", "arial.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            pass
    return ImageFont.load_default(size=taille)


def dessiner(dossier, largeur=1600):
    m = json.load(open(os.path.join(dossier, "manifest.json"), encoding="utf-8"))
    demi = m["repere"]["demi_cote_m"]
    r = m["relief"]
    z = np.fromfile(os.path.join(dossier, r["fichier"]), "<f4").reshape(r["lignes"], r["colonnes"])
    # ombrage du relief (lumière venant du nord-ouest)
    gy, gx = np.gradient(z, r["pas_m"])
    ombre = np.clip(0.75 + (gx - gy) * 1.2, 0.35, 1.15)
    alt = (z - z.min()) / max(float(np.ptp(z)), 1)
    base = np.stack([200 + 30 * alt, 205 + 20 * alt, 190 + 20 * alt], -1) * ombre[..., None]
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).resize((largeur, largeur), Image.BILINEAR)
    d = ImageDraw.Draw(img, "RGBA")
    k = largeur / (2 * demi)
    px = lambda pts: [((x + demi) * k, (demi - y) * k) for x, y in pts]
    for s in json.load(gzip.open(os.path.join(dossier, "sols.json.gz"))):
        c = COUL_SOL.get(s["classe"])
        if c:
            d.polygon(px(s["contour"]), fill=c + (150,))
    eau = json.load(gzip.open(os.path.join(dossier, "eau.json.gz")))
    for s in eau["surfaces"]:
        d.polygon(px(s["contour"]), fill=(120, 175, 220, 255))
    for c in eau["cours"]:
        d.line(px(c["trace"]), fill=(120, 175, 220, 255), width=2)
    routes = json.load(gzip.open(os.path.join(dossier, "routes.json.gz")))
    for g in ("pieton", "desserte", "rail", "rue", "avenue", "voie_rapide"):
        w, c = GAB[g]
        for t in routes["troncons"]:
            if t["gabarit"] == g:
                d.line(px(t["trace"]), fill=c + (255,), width=w)
    for b in json.load(gzip.open(os.path.join(dossier, "batiments.json.gz"))):
        estime = "hauteur" in b["estime"]
        teinte = int(150 - min(b["hauteur_m"], 40) * 2.5)
        d.polygon(px(b["contour"]), fill=(teinte, teinte - 10, teinte - 20, 255) if not estime else (teinte + 20, teinte + 5, teinte - 25, 255))
    q = m["qualite"]
    d.rectangle([0, 0, largeur, 44], fill=(255, 255, 255, 215))
    d.text((10, 6), f"{m['ville']['nom']} ({m['ville']['taille']}, {m['ville']['cote_km']} km)  |  {q['batiments']} bâtiments  |  "
           f"hauteurs réelles {q['pct_hauteur_reelle']} %  |  note {q['note_sur_100']}/100", fill=(20, 20, 20, 255), font=police())
    d.text((10, 24), "© OpenStreetMap contributors, Overture Maps Foundation  |  relief : Copernicus GLO-30", fill=(60, 60, 60, 255), font=police(12))
    dest = os.path.join(dossier, "apercu.png")
    img.save(dest, optimize=True)
    return dest


if __name__ == "__main__":
    print(dessiner(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1600))
