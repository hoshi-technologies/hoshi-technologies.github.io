"""Étape B (hors ligne, déterministe) : transforme le cache brut d'une ville en « paquet de ville » jouable.

Même cache + même version de l'outil => paquet identique à l'octet près (vérifié par les tests).
Format du paquet : voir FORMAT_PAQUET.md.

Usage : python construire.py villes/annecy.json [dossier_cache] [dossier_sortie]
"""
import gzip
import hashlib
import io
import json
import math
import os
import sys
import time
import zlib

import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely import ops

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lire_dem import read_dem  # noqa: E402

VERSION_FORMAT = 1
VERSION_OUTIL = "0.1.0"
ICI = os.path.dirname(os.path.abspath(__file__))
PAS_RELIEF_M = 10.0
M_PAR_DEGRE = 111320.0

# --- Correspondances Overture -> catégories du jeu -----------------------------------------
GABARITS = {
    "motorway": "voie_rapide", "trunk": "voie_rapide",
    "primary": "avenue", "secondary": "avenue",
    "tertiary": "rue", "residential": "rue", "living_street": "rue", "unclassified": "rue", "unknown": "rue",
    "service": "desserte", "track": "desserte",
    "pedestrian": "pieton", "footway": "pieton", "path": "pieton", "steps": "pieton",
    "cycleway": "pieton", "bridleway": "pieton", "sidewalk": "pieton", "crosswalk": "pieton",
}
USAGES = {
    "residential": "habitat", "house": "habitat", "apartments": "habitat", "detached": "habitat",
    "semidetached_house": "habitat", "terrace": "habitat", "bungalow": "habitat", "dormitory": "habitat",
    "commercial": "commerce", "retail": "commerce", "supermarket": "commerce", "kiosk": "commerce",
    "office": "bureaux", "hotel": "commerce",
    "industrial": "activites", "warehouse": "activites", "manufacture": "activites",
    "school": "ecole", "kindergarten": "ecole", "university": "ecole", "college": "ecole",
    "hospital": "sante", "clinic": "sante",
    "church": "culte", "chapel": "culte", "cathedral": "culte", "mosque": "culte", "synagogue": "culte", "temple": "culte",
    "civic": "public", "government": "public", "public": "public", "fire_station": "public", "police": "public",
    "train_station": "transport", "transportation": "transport", "parking": "transport",
    "garage": "annexe", "garages": "annexe", "shed": "annexe", "roof": "annexe", "carport": "annexe",
    "farm": "agricole", "barn": "agricole", "farm_auxiliary": "agricole",
}
SUBTYPE_USAGES = {"residential": "habitat", "commercial": "commerce", "industrial": "activites",
                  "education": "ecole", "medical": "sante", "religious": "culte", "civic": "public",
                  "transportation": "transport", "agricultural": "agricole", "outbuilding": "annexe"}


# --- Outils --------------------------------------------------------------------------------
def charger_regles(pays):
    regles = json.load(open(os.path.join(ICI, "regles_pays", "generique.json"), encoding="utf-8"))
    chemin = os.path.join(ICI, "regles_pays", f"{pays}.json")
    if os.path.exists(chemin):
        regles.update({k: v for k, v in json.load(open(chemin, encoding="utf-8")).items() if k != "herite"})
    return regles


class Projection:
    """Coordonnées locales en mètres : x vers l'est, y vers le nord, origine au centre de la zone."""

    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = M_PAR_DEGRE * math.cos(math.radians(lat0))

    def vers_local(self, geom):
        return shapely.transform(geom, lambda c: np.column_stack(
            ((c[:, 0] - self.lon0) * self.kx, (c[:, 1] - self.lat0) * M_PAR_DEGRE)))

    def vers_lonlat(self, x, y):
        return self.lon0 + x / self.kx, self.lat0 + y / M_PAR_DEGRE


def arrondi(coords, pas=0.1):
    return [[round(float(x), 1), round(float(y), 1)] for x, y in np.round(np.asarray(coords) / pas) * pas]


def polygones(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if hasattr(geom, "geoms"):
        return [g for sub in geom.geoms for g in polygones(sub)]
    return []


def lignes(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    if hasattr(geom, "geoms"):
        return [g for sub in geom.geoms for g in lignes(sub)]
    return []


def nom_principal(noms):
    return (noms or {}).get("primary") if isinstance(noms, dict) else None


def graine(texte):
    """Nombre pseudo-aléatoire stable dérivé d'un identifiant (déterminisme)."""
    return zlib.crc32(texte.encode()) / 0xFFFFFFFF


# --- Bâtiments -----------------------------------------------------------------------------
def estimer_etages(surface, regles, ident):
    e = regles["etages_par_defaut"]
    if surface < 60:
        base = e["petit_moins_60m2"]
    elif surface < 150:
        base = e["moins_150m2"]
    elif surface < 600:
        base = e["moins_600m2"]
    else:
        base = e["plus_600m2"]
    # petite variation stable (+0 ou +1 étage) pour éviter un paysage trop uniforme
    return base + (1 if base > 1 and graine(ident) > 0.7 else 0)


def traiter_batiments(table, proj, cadre, regles):
    out, stats = [], {"hauteur_reelle": 0, "hauteur_estimee": 0, "usage_reel": 0, "usage_estime": 0,
                      "source_osm": 0, "source_detection_ia": 0, "autre_source": 0}
    if table is None or table.num_rows == 0:
        return out, stats
    cols = table.to_pydict()
    geoms = proj.vers_local(shapely.from_wkb(cols["geometry"]))
    for i, ident in enumerate(cols["id"]):
        for poly in polygones(geoms[i].intersection(cadre)):
            surface = poly.area
            if surface < 4:
                continue
            h = cols["height"][i]
            etages = cols["num_floors"][i]
            if h:
                hauteur, h_estimee = float(h), False
            elif etages:
                hauteur, h_estimee = etages * regles["hauteur_etage_m"], False
            else:
                etages = estimer_etages(surface, regles, ident)
                hauteur, h_estimee = etages * regles["hauteur_etage_m"], True
            etages = etages or max(1, round(hauteur / regles["hauteur_etage_m"]))
            usage = USAGES.get(cols["class"][i] or "") or SUBTYPE_USAGES.get((cols.get("subtype") or [None] * len(cols["id"]))[i] or "")
            u_estime = usage is None
            if u_estime:
                usage = "annexe" if surface < 30 else ("activites" if surface > 1500 else "habitat")
            src = (cols["sources"][i] or [{}])[0].get("dataset", "?")
            cle_src = "source_osm" if src == "OpenStreetMap" else (
                "source_detection_ia" if ("ML" in src or "Google" in src or "Esri" in src) else "autre_source")
            stats[cle_src] += 1
            stats["hauteur_estimee" if h_estimee else "hauteur_reelle"] += 1
            stats["usage_estime" if u_estime else "usage_reel"] += 1
            out.append({
                "id": ident, "contour": arrondi(np.asarray(poly.exterior.coords)[:-1]),
                "hauteur_m": round(hauteur, 1), "etages": int(etages), "usage": usage,
                "estime": [k for k, v in (("hauteur", h_estimee), ("usage", u_estime)) if v],
                "source": "osm" if cle_src == "source_osm" else ("detection_ia" if cle_src == "source_detection_ia" else "autre"),
                "surface_m2": round(surface, 1),
            })
    out.sort(key=lambda b: (b["id"], b["contour"][0]))
    return out, stats


# --- Routes (graphe : nœuds aux intersections, tronçons entre nœuds) ------------------------
def traiter_routes(table, proj, cadre):
    if table is None or table.num_rows == 0:
        return [], []
    cols = table.to_pydict()
    geoms = proj.vers_local(shapely.from_wkb(cols["geometry"]))
    morceaux = []
    for i, ident in enumerate(cols["id"]):
        sous = cols["subtype"][i]
        if sous == "road":
            gabarit = GABARITS.get(cols["class"][i] or "unknown", "rue")
        elif sous == "rail":
            gabarit = "rail"
        else:
            continue
        flags = {v for f in (cols.get("road_flags", [None] * len(cols["id"]))[i] or []) for v in (f.get("values") or [])}
        # coupe le tronçon à chaque connecteur Overture -> vraies intersections
        positions = sorted({0.0, 1.0} | {round(float(c["at"]), 6) for c in (cols["connectors"][i] or []) if c.get("at") is not None}) \
            if "connectors" in cols else [0.0, 1.0]
        ligne = geoms[i]
        for a, b in zip(positions, positions[1:]):
            if b - a <= 1e-9:
                continue
            seg = ops.substring(ligne, a, b, normalized=True)
            for part in lignes(seg.intersection(cadre)):
                if part.length < 0.5:
                    continue
                morceaux.append((ident, gabarit, nom_principal(cols["names"][i]), "is_bridge" in flags,
                                 "is_tunnel" in flags, arrondi(part.coords)))
    noeuds, troncons = {}, []

    def noeud(p):
        cle = (round(p[0] * 2) / 2, round(p[1] * 2) / 2)  # fusion à 0,5 m près
        if cle not in noeuds:
            noeuds[cle] = None
        return cle

    for ident, gabarit, nom, pont, tunnel, coords in sorted(morceaux, key=lambda m: (m[0], m[5][0])):
        a, b = noeud(coords[0]), noeud(coords[-1])
        if a == b and len(coords) < 3:
            continue
        troncons.append({"id_source": ident, "gabarit": gabarit, "nom": nom, "pont": pont, "tunnel": tunnel,
                         "a": a, "b": b, "trace": coords,
                         "longueur_m": round(float(shapely.LineString(coords).length), 1)})
    ordre = {cle: i for i, cle in enumerate(sorted(noeuds))}
    liste_noeuds = [{"id": i, "x": cle[0], "y": cle[1]} for cle, i in sorted(ordre.items(), key=lambda kv: kv[1])]
    for t in troncons:
        t["a"], t["b"] = ordre[t["a"]], ordre[t["b"]]
    for i, t in enumerate(troncons):
        t["id"] = i
    return liste_noeuds, troncons


# --- Eau et sols ---------------------------------------------------------------------------
def traiter_surfaces(table, proj, cadre, surface_min):
    surfaces, traits = [], []
    if table is None or table.num_rows == 0:
        return surfaces, traits
    cols = table.to_pydict()
    geoms = proj.vers_local(shapely.from_wkb(cols["geometry"]))
    for i, ident in enumerate(cols["id"]):
        g = geoms[i].intersection(cadre)
        base = {"id": ident, "type": cols["subtype"][i], "classe": cols["class"][i],
                "nom": nom_principal(cols.get("names", [None] * len(cols["id"]))[i])}
        for p in polygones(g):
            if p.area >= surface_min:
                surfaces.append(dict(base, contour=arrondi(np.asarray(p.exterior.coords)[:-1]),
                                     trous=[arrondi(np.asarray(r.coords)[:-1]) for r in p.interiors if shapely.Polygon(r).area >= surface_min],
                                     surface_m2=round(p.area, 1)))
        for l in lignes(g):
            if l.length >= 1:
                traits.append(dict(base, trace=arrondi(l.coords)))
    surfaces.sort(key=lambda s: (s["id"], s["contour"][0]))
    traits.sort(key=lambda s: (s["id"], s["trace"][0]))
    return surfaces, traits


# --- Relief --------------------------------------------------------------------------------
def _filtre(arr, fonction, iterations):
    for _ in range(iterations):
        p = np.pad(arr, 1, mode="edge")
        vues = [p[dy:dy + arr.shape[0], dx:dx + arr.shape[1]] for dy in range(3) for dx in range(3)]
        arr = fonction(np.stack(vues), axis=0)
    return arr


def construire_relief(dossier, bb_lonlat, proj, cote_m, eaux, regles):
    """Grille régulière de PAS_RELIEF_M mètres. Le modèle Copernicus est un modèle « de surface »
    (toits, arbres) : on estime le sol par un filtre minimum puis un lissage (signalé comme estimé)."""
    x0, y0, x1, y1 = bb_lonlat
    la, lo = math.floor((y0 + y1) / 2), math.floor((x0 + x1) / 2)
    from extraire import nom_tuile_dem
    chemin = os.path.join(dossier, nom_tuile_dem(la + 0.5, lo + 0.5) + ".tif")
    dem = read_dem(open(chemin, "rb").read())
    h, w = dem.shape
    # découpe native avec marge, filtre « sol », puis rééchantillonnage bilinéaire
    c0, c1 = max(int((x0 - lo) * w) - 8, 0), min(int(math.ceil((x1 - lo) * w)) + 8, w)
    r0, r1 = max(int((la + 1 - y1) * h) - 8, 0), min(int(math.ceil((la + 1 - y0) * h)) + 8, h)
    sub = dem[r0:r1, c0:c1].astype(np.float64)
    rayon_px = max(1, round(regles["relief_rayon_sol_m"] / 30))
    sol = _filtre(_filtre(sub, np.min, rayon_px), np.mean, rayon_px + 1)
    n = int(round(cote_m / PAS_RELIEF_M)) + 1
    xs = np.linspace(-cote_m / 2, cote_m / 2, n)
    ys = np.linspace(cote_m / 2, -cote_m / 2, n)  # ligne 0 = nord
    gx, gy = np.meshgrid(xs, ys)
    lon, lat = proj.vers_lonlat(gx, gy)
    fc = (lon - lo) * w - 0.5 - c0
    fr = (la + 1 - lat) * h - 0.5 - r0
    i0, j0 = np.floor(fr).astype(int), np.floor(fc).astype(int)
    di, dj = fr - i0, fc - j0
    i0, j0 = np.clip(i0, 0, sol.shape[0] - 2), np.clip(j0, 0, sol.shape[1] - 2)
    z = (sol[i0, j0] * (1 - di) * (1 - dj) + sol[i0 + 1, j0] * di * (1 - dj)
         + sol[i0, j0 + 1] * (1 - di) * dj + sol[i0 + 1, j0 + 1] * di * dj)
    # plans d'eau : surface plane au niveau de l'eau
    for e in eaux:
        if e["type"] in ("lake", "reservoir", "pond", "water") or (e["classe"] in ("lake", "reservoir", "basin", "pond")):
            poly = shapely.Polygon(e["contour"], e["trous"])
            dedans = shapely.contains_xy(poly, gx, gy)
            if dedans.sum() > 4:
                z[dedans] = np.percentile(z[dedans], 10)
    return np.round(z.astype(np.float32), 2), n


# --- Assemblage ----------------------------------------------------------------------------
def ecrire_json_gz(chemin, obj):
    brut = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    tampon = io.BytesIO()
    with gzip.GzipFile(fileobj=tampon, mode="wb", mtime=0, compresslevel=9) as f:
        f.write(brut)
    open(chemin, "wb").write(tampon.getvalue())


def sha256(chemin):
    return hashlib.sha256(open(chemin, "rb").read()).hexdigest()


def lire_table(dossier, nom):
    chemin = os.path.join(dossier, f"{nom}.parquet")
    if not os.path.exists(chemin):
        return None
    t = pq.read_table(chemin)
    return t if t.num_rows else None


CREDITS = """SOURCES DES DONNÉES DE CETTE VILLE
==================================
Ce paquet est une base de données dérivée, publiée sous Open Database License (ODbL) 1.0 :
https://opendatacommons.org/licenses/odbl/1-0/

Bâtiments, routes, eau, occupation du sol :
  © OpenStreetMap contributors (https://www.openstreetmap.org/copyright), Overture Maps Foundation
  (https://overturemaps.org). Version Overture : {release}.
  Certains bâtiments proviennent de détections automatiques sur images (Microsoft, Google, Esri)
  distribuées par Overture ; voir le champ "source" de chaque bâtiment.

Relief :
  produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
  2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.
  Le relief a été modifié (estimation du sol, lissage, nivellement des plans d'eau).
  Les données Copernicus sont fournies « en l'état », sans garantie.

Les hauteurs, usages et populations marqués « estimé » sont calculés par le jeu, pas mesurés.
Ce jeu est une fiction inspirée de données réelles. Ce n'est pas une prédiction.
"""


def construire(fichier_ville, cache, sortie):
    t0 = time.time()
    ville = json.load(open(fichier_ville, encoding="utf-8"))
    regles = charger_regles(ville["pays"])
    dossier = os.path.join(cache, ville["id"])
    extraction = json.load(open(os.path.join(dossier, "extraction.json")))
    cote_m = ville["cote_km"] * 1000
    proj = Projection(ville["centre"]["lat"], ville["centre"]["lon"])
    cadre = shapely.box(-cote_m / 2, -cote_m / 2, cote_m / 2, cote_m / 2)
    from extraire import emprise
    bb = emprise(ville["centre"], ville["cote_km"])

    batiments, st_bat = traiter_batiments(lire_table(dossier, "batiments"), proj, cadre, regles)
    noeuds, troncons = traiter_routes(lire_table(dossier, "routes"), proj, cadre)
    eaux, cours_eau = traiter_surfaces(lire_table(dossier, "eau"), proj, cadre, 25)
    sols, _ = traiter_surfaces(lire_table(dossier, "sols"), proj, cadre, 100)
    relief, n_relief = construire_relief(dossier, bb, proj, cote_m, eaux, regles)

    # Population : estimation à partir de la surface habitable (affichée comme estimation)
    surf_hab = sum(b["surface_m2"] * b["etages"] for b in batiments if b["usage"] == "habitat")
    pop_est = int(round(surf_hab * regles["part_surface_habitable"] / regles["m2_habitable_par_habitant"], -2))

    nb = max(len(batiments), 1)
    routes_car = [t for t in troncons if t["gabarit"] not in ("pieton", "rail")]
    qualite = {
        "batiments": len(batiments),
        "pct_batiments_osm": round(100 * st_bat["source_osm"] / nb),
        "pct_batiments_detection_ia": round(100 * st_bat["source_detection_ia"] / nb),
        "pct_hauteur_reelle": round(100 * st_bat["hauteur_reelle"] / nb),
        "pct_usage_reel": round(100 * st_bat["usage_reel"] / nb),
        "km_routes_carrossables": round(sum(t["longueur_m"] for t in routes_car) / 1000, 1),
        "pct_routes_nommees": round(100 * sum(1 for t in routes_car if t["nom"]) / max(len(routes_car), 1)),
        "plans_eau": len(eaux), "cours_eau": len(cours_eau), "zones_sol": len(sols),
        "relief": "Copernicus GLO-30 (30 m), sol estimé par filtrage, grille de 10 m",
    }
    note = (25 * min(1, len(batiments) / (cote_m / 1000) ** 2 / 400) + 20 * qualite["pct_batiments_osm"] / 100
            + 15 * qualite["pct_hauteur_reelle"] / 100 + 20 * qualite["pct_routes_nommees"] / 100
            + 20 * min(1, qualite["km_routes_carrossables"] / (cote_m / 1000) ** 2 / 4))
    qualite["note_sur_100"] = round(note)
    estimations = [
        {"quoi": "hauteur des bâtiments", "part_pct": 100 - qualite["pct_hauteur_reelle"],
         "methode": "selon la surface au sol (règles du pays)"},
        {"quoi": "usage des bâtiments", "part_pct": 100 - qualite["pct_usage_reel"],
         "methode": "habitat par défaut, annexe sous 30 m², activités au-delà de 1 500 m²"},
        {"quoi": "altitude du sol", "part_pct": 100,
         "methode": "modèle de surface Copernicus filtré (toits et arbres retirés approximativement)"},
        {"quoi": "population", "valeur": pop_est,
         "methode": f"surface habitable estimée / {regles['m2_habitable_par_habitant']} m² par habitant",
         "fiabilite": "faible : à remplacer par une source officielle (France : INSEE, données carroyées)"},
    ]

    nom_paquet = f"{ville['id']}_{ville['taille']}_v{VERSION_FORMAT}"
    dest = os.path.join(sortie, nom_paquet)
    os.makedirs(dest, exist_ok=True)
    ecrire_json_gz(os.path.join(dest, "batiments.json.gz"), batiments)
    ecrire_json_gz(os.path.join(dest, "routes.json.gz"), {"noeuds": noeuds, "troncons": troncons})
    ecrire_json_gz(os.path.join(dest, "eau.json.gz"), {"surfaces": eaux, "cours": cours_eau})
    ecrire_json_gz(os.path.join(dest, "sols.json.gz"), sols)
    open(os.path.join(dest, "relief.f32"), "wb").write(relief.astype("<f4").tobytes())
    open(os.path.join(dest, "CREDITS_DONNEES.txt"), "w", encoding="utf-8").write(
        CREDITS.format(release=extraction["release_overture"]))

    fichiers = sorted(f for f in os.listdir(dest) if f != "manifest.json" and not f.endswith(".png"))
    manifest = {
        "format": "paquet_ville", "version_format": VERSION_FORMAT, "version_outil": VERSION_OUTIL,
        "ville": {k: ville[k] for k in ("id", "nom", "pays", "region", "centre", "taille", "cote_km", "statut")},
        "repere": {"unite": "metre", "x": "est", "y": "nord", "origine": "centre de la zone",
                   "demi_cote_m": cote_m / 2},
        "relief": {"fichier": "relief.f32", "type": "float32 little-endian", "colonnes": n_relief,
                   "lignes": n_relief, "pas_m": PAS_RELIEF_M, "ligne_0": "nord", "colonne_0": "ouest",
                   "alt_min_m": float(relief.min()), "alt_max_m": float(relief.max())},
        "sources": {"overture_release": extraction["release_overture"], "relief": "Copernicus DEM GLO-30",
                    "licence_paquet": "ODbL-1.0"},
        "qualite": qualite, "estimations": estimations, "population_reference": None,
        "empreintes_sha256": {f: sha256(os.path.join(dest, f)) for f in fichiers},
    }
    open(os.path.join(dest, "manifest.json"), "w", encoding="utf-8").write(
        json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True))
    taille = sum(os.path.getsize(os.path.join(dest, f)) for f in os.listdir(dest))
    print(f"Paquet {nom_paquet} : {len(batiments)} bâtiments, {len(noeuds)} carrefours, {len(troncons)} tronçons, "
          f"{len(eaux)} plans d'eau, relief {n_relief}x{n_relief}, {taille / 1e6:.2f} Mo, "
          f"note {qualite['note_sur_100']}/100, {time.time() - t0:.1f} s")
    return dest


if __name__ == "__main__":
    construire(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "cache",
               sys.argv[3] if len(sys.argv) > 3 else "paquets")
