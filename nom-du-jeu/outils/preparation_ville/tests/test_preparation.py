"""Tests de la préparation des données (hors ligne, sur une petite ville synthétique).
Lancer : python -m pytest tests"""
import gzip
import io
import json
import math
import os
import shutil
import sys

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import shapely
import tifffile

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(ICI))
import construire  # noqa: E402
from extraire import emprise, nom_tuile_dem  # noqa: E402
from lire_dem import read_dem  # noqa: E402

LAT, LON = 45.5, 6.5  # tuile N45 E006
VILLE = {"id": "test-ville", "nom": "Testville", "pays": "FR", "region": "Test", "centre": {"lat": LAT, "lon": LON},
         "taille": "quartier", "cote_km": 1.0, "statut": "test"}


def m_vers_lonlat(x, y):
    return LON + x / (111320 * math.cos(math.radians(LAT))), LAT + y / 111320


def ligne(points):
    return shapely.to_wkb(shapely.LineString([m_vers_lonlat(*p) for p in points]))


def poly(points):
    return shapely.to_wkb(shapely.Polygon([m_vers_lonlat(*p) for p in points]))


def bbox(wkb):
    g = shapely.from_wkb(wkb)
    x0, y0, x1, y1 = g.bounds
    return {"xmin": x0, "xmax": x1, "ymin": y0, "ymax": y1}


@pytest.fixture
def cache(tmp_path):
    d = tmp_path / "cache" / VILLE["id"]
    d.mkdir(parents=True)
    # 3 bâtiments : hauteur réelle, nombre d'étages réel, rien (=> estimé) ; 1 bâtiment à moitié hors zone
    geoms = [poly([(0, 0), (20, 0), (20, 10), (0, 10)]), poly([(50, 50), (60, 50), (60, 60), (50, 60)]),
             poly([(-100, -100), (-70, -100), (-70, -80), (-100, -80)]), poly([(480, 0), (520, 0), (520, 20), (480, 20)])]
    pq.write_table(pa.table({
        "id": ["b1", "b2", "b3", "b4"], "geometry": geoms, "bbox": [bbox(g) for g in geoms],
        "sources": [[{"dataset": "OpenStreetMap"}], [{"dataset": "OpenStreetMap"}],
                    [{"dataset": "Microsoft ML Buildings"}], [{"dataset": "OpenStreetMap"}]],
        "height": [12.0, None, None, None], "num_floors": [None, 2, None, None],
        "class": ["apartments", None, None, "retail"], "subtype": [None, "residential", None, None],
        "names": [None, None, None, None]}), d / "batiments.parquet")
    # 2 routes qui se croisent en (0, 200) : le connecteur est au milieu de chacune
    r = [ligne([(-300, 200), (300, 200)]), ligne([(0, -100), (0, 500)])]
    pq.write_table(pa.table({
        "id": ["r1", "r2"], "geometry": r, "bbox": [bbox(g) for g in r], "subtype": ["road", "road"],
        "class": ["primary", "residential"], "names": [{"primary": "Avenue Test"}, None],
        "connectors": [[{"connector_id": "c1", "at": 0.0}, {"connector_id": "cx", "at": 0.5}, {"connector_id": "c2", "at": 1.0}],
                       [{"connector_id": "c3", "at": 0.0}, {"connector_id": "cx", "at": 0.5}, {"connector_id": "c4", "at": 1.0}]],
        "road_flags": [None, [{"values": ["is_bridge"], "between": None}]]}), d / "routes.parquet")
    lac = [poly([(100, -400), (400, -400), (400, -150), (100, -150)])]
    pq.write_table(pa.table({"id": ["l1"], "geometry": lac, "bbox": [bbox(g) for g in lac], "subtype": ["lake"],
                             "class": ["lake"], "names": [{"primary": "Lac Test"}]}), d / "eau.parquet")
    parc = [poly([(-400, 300), (-200, 300), (-200, 450), (-400, 450)])]
    pq.write_table(pa.table({"id": ["s1"], "geometry": parc, "bbox": [bbox(g) for g in parc], "subtype": ["park"],
                             "class": ["park"]}), d / "sols.parquet")
    # tuile de relief : pente douce de 400 à 760 m + bruit, résolution réduite (360 x 360)
    yy, xx = np.mgrid[0:360, 0:360]
    z = (400 + xx.astype("f4") + np.random.RandomState(0).rand(360, 360).astype("f4")).astype("f4")
    b = io.BytesIO()
    tifffile.imwrite(b, z, tile=(128, 128), compression="zlib")
    (d / (nom_tuile_dem(LAT, LON) + ".tif")).write_bytes(b.getvalue())
    (d / "extraction.json").write_text(json.dumps({"release_overture": "test", "themes": {}}))
    fv = tmp_path / "ville.json"
    fv.write_text(json.dumps(VILLE))
    return tmp_path, str(fv)


def construire_dans(cache, sortie):
    base, fv = cache
    return construire.construire(fv, str(base / "cache"), str(base / sortie))


def charger(dest, nom):
    return json.load(gzip.open(os.path.join(dest, nom)))


def test_deterministe(cache):
    """Même entrée => paquet identique à l'octet près."""
    a = json.load(open(os.path.join(construire_dans(cache, "s1"), "manifest.json")))
    b = json.load(open(os.path.join(construire_dans(cache, "s2"), "manifest.json")))
    assert a["empreintes_sha256"] == b["empreintes_sha256"]
    assert len(a["empreintes_sha256"]) == 6


def test_manifest_et_credits(cache):
    dest = construire_dans(cache, "s")
    m = json.load(open(os.path.join(dest, "manifest.json")))
    assert m["format"] == "paquet_ville" and m["version_format"] == construire.VERSION_FORMAT
    assert m["sources"]["licence_paquet"] == "ODbL-1.0"
    assert m["repere"]["x"] == "est" and m["repere"]["y"] == "nord"
    credits = open(os.path.join(dest, "CREDITS_DONNEES.txt"), encoding="utf-8").read()
    for mention in ("© OpenStreetMap contributors", "Overture Maps Foundation", "Copernicus WorldDEM-30", "ODbL"):
        assert mention in credits
    assert {e["quoi"] for e in m["estimations"]} >= {"hauteur des bâtiments", "population"}


def test_batiments_hauteurs_et_estimations(cache):
    bats = {b["id"]: b for b in charger(construire_dans(cache, "s"), "batiments.json.gz")}
    assert bats["b1"]["hauteur_m"] == 12.0 and bats["b1"]["estime"] == [] and bats["b1"]["usage"] == "habitat"
    assert bats["b2"]["hauteur_m"] == 6.0 and "hauteur" not in bats["b2"]["estime"]
    assert "hauteur" in bats["b3"]["estime"] and "usage" in bats["b3"]["estime"]
    assert bats["b3"]["source"] == "detection_ia"
    # b4 dépasse le bord est (x = 500) : il est découpé
    assert max(p[0] for p in bats["b4"]["contour"]) <= 500.0
    assert bats["b4"]["usage"] == "commerce"


def test_routes_coupees_aux_intersections(cache):
    r = charger(construire_dans(cache, "s"), "routes.json.gz")
    # 2 routes coupées au croisement => 4 tronçons, 5 nœuds (centre + 4 extrémités)
    assert len(r["troncons"]) == 4
    assert len(r["noeuds"]) == 5
    centre = [n for n in r["noeuds"] if n["x"] == 0 and n["y"] == 200]
    assert len(centre) == 1
    degres = sum(1 for t in r["troncons"] if centre[0]["id"] in (t["a"], t["b"]))
    assert degres == 4
    assert {t["gabarit"] for t in r["troncons"]} == {"avenue", "rue"}
    assert all(t["pont"] for t in r["troncons"] if t["gabarit"] == "rue")
    # tout est dans la zone
    assert all(abs(c) <= 500.0 for t in r["troncons"] for p in t["trace"] for c in p)


def test_relief_et_lac_plat(cache):
    dest = construire_dans(cache, "s")
    m = json.load(open(os.path.join(dest, "manifest.json")))
    n = m["relief"]["colonnes"]
    z = np.fromfile(os.path.join(dest, "relief.f32"), "<f4").reshape(n, n)
    assert n == 101  # 1 km / 10 m + 1
    assert 400 < z.min() < z.max() < 800
    # le lac (x 100..400, y -400..-150) est plat
    xs = np.linspace(-500, 500, n)
    ys = np.linspace(500, -500, n)
    gx, gy = np.meshgrid(xs, ys)
    dedans = (gx > 120) & (gx < 380) & (gy > -380) & (gy < -170)
    assert np.ptp(z[dedans]) < 0.01
    # la pente est-ouest est conservée hors du lac
    assert z[10, -10] > z[10, 10]


def test_lecture_dem_predicteur_flottant():
    """Encode une tuile comme Copernicus (DEFLATE + prédicteur flottant) et vérifie la relecture."""
    import struct
    import zlib
    rs = np.random.RandomState(2)
    a = (rs.rand(16, 16) * 3000).astype("f4")
    rows = []
    for row in a:
        octets = row.astype(">f4").view(np.uint8).reshape(16, 4).T.reshape(-1)  # plans d'octets
        diff = np.diff(octets.astype(np.int16), prepend=0).astype(np.uint8)
        rows.append(diff)
    tuile = zlib.compress(np.concatenate(rows).tobytes())
    # TIFF minimal à une tuile
    entrees = [(256, 3, 1, 16), (257, 3, 1, 16), (258, 3, 1, 32), (259, 3, 1, 8), (262, 3, 1, 1),
               (277, 3, 1, 1), (317, 3, 1, 3), (322, 3, 1, 16), (323, 3, 1, 16), (324, 4, 1, 0), (325, 4, 1, len(tuile)),
               (339, 3, 1, 3)]
    ifd_off = 8
    data_off = ifd_off + 2 + 12 * len(entrees) + 4
    entrees = [(t, ty, c, data_off if t == 324 else v) for t, ty, c, v in entrees]
    b = b"II*\x00" + struct.pack("<I", ifd_off) + struct.pack("<H", len(entrees))
    for t, ty, c, v in entrees:
        b += struct.pack("<HHI", t, ty, c) + (struct.pack("<HH", v, 0) if ty == 3 else struct.pack("<I", v))
    b += struct.pack("<I", 0) + tuile
    assert np.array_equal(read_dem(b), a)


def test_emprise_carree():
    x0, y0, x1, y1 = emprise({"lat": 45.0, "lon": 6.0}, 4.0)
    largeur = (x1 - x0) * 111.32 * math.cos(math.radians(45.0))
    hauteur = (y1 - y0) * 111.32
    assert abs(largeur - 4.0) < 1e-6 and abs(hauteur - 4.0) < 1e-6


def test_etages_estimes_stables():
    regles = construire.charger_regles("FR")
    assert construire.estimer_etages(40, regles, "x") == 1
    a = [construire.estimer_etages(300, regles, f"id{i}") for i in range(50)]
    assert a == [construire.estimer_etages(300, regles, f"id{i}") for i in range(50)]
    assert set(a) <= {3, 4}
    assert regles["m2_habitable_par_habitant"] == 40  # surcharge France
