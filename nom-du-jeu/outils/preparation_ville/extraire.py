"""Étape A (en ligne) : télécharge les données brutes d'une ville dans un cache local.

Sources : Overture Maps (bâtiments, routes, eau, occupation du sol) et Copernicus DEM GLO-30 (relief).
Tout ce qui suit (étape B, construire.py) fonctionne hors ligne à partir de ce cache.

Usage : python extraire.py villes/annecy.json [dossier_cache]
"""
import json
import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

RELEASE_OVERTURE = "2026-10-21.0"
THEMES = {
    "batiments": ("theme=buildings/type=building",
                  ["id", "geometry", "bbox", "sources", "height", "num_floors", "class", "subtype", "names"]),
    "routes": ("theme=transportation/type=segment",
               ["id", "geometry", "bbox", "subtype", "class", "names", "connectors", "road_flags"]),
    "eau": ("theme=base/type=water", ["id", "geometry", "bbox", "subtype", "class", "names"]),
    "sols": ("theme=base/type=land_use", ["id", "geometry", "bbox", "subtype", "class"]),
}
MARGE = 1.15  # on télécharge un peu plus large que la zone, puis on découpe proprement


def s3():
    proxy = os.environ.get("HTTPS_PROXY")
    kw = {"proxy_options": proxy} if proxy else {}
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", **kw)


def emprise(centre, cote_km):
    """Rectangle (lon_min, lat_min, lon_max, lat_max) de cote_km autour du centre."""
    lat, lon = centre["lat"], centre["lon"]
    dlat = cote_km / 2 / 111.32
    dlon = cote_km / 2 / (111.32 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def _index_fichier(fs, chemin):
    md = pq.ParquetFile(fs.open_input_file(chemin)).metadata
    noms = [md.schema.column(i).path for i in range(md.num_columns)]
    cols = {k: noms.index(f"bbox.{k}") for k in ("xmin", "xmax", "ymin", "ymax")}
    out = []
    for rg in range(md.num_row_groups):
        r = md.row_group(rg)
        st = {k: r.column(i).statistics for k, i in cols.items()}
        out.append([rg, st["xmin"].min, st["xmax"].max, st["ymin"].min, st["ymax"].max])
    return out


def index_theme(fs, prefixe, cache):
    """Index des morceaux de fichiers Overture (fait une seule fois par version, ~20 s)."""
    nom = prefixe.replace("/", "_").replace("=", "-")
    dest = os.path.join(cache, f"index_{RELEASE_OVERTURE}_{nom}.json")
    if os.path.exists(dest):
        return json.load(open(dest))
    base = f"overturemaps-us-west-2/release/{RELEASE_OVERTURE}/{prefixe}/"
    fichiers = [f.path for f in fs.get_file_info(pafs.FileSelector(base)) if f.path.endswith(".parquet")]
    with ThreadPoolExecutor(16) as ex:
        idx = dict(zip(fichiers, ex.map(lambda p: _index_fichier(fs, p), fichiers)))
    json.dump(idx, open(dest, "w"))
    return idx


def lire_zone(fs, idx, colonnes, bb):
    x0, y0, x1, y1 = bb
    morceaux = []
    for chemin, rgs in sorted(idx.items()):
        hits = [r[0] for r in rgs if r[1] <= x1 and r[2] >= x0 and r[3] <= y1 and r[4] >= y0]
        if not hits:
            continue
        pf = pq.ParquetFile(fs.open_input_file(chemin))
        cols = [c for c in colonnes if c in pf.schema_arrow.names]
        t = pf.read_row_groups(hits, columns=cols)
        b = t.column("bbox")
        m = pc.and_(
            pc.and_(pc.less_equal(pc.struct_field(b, "xmin"), x1), pc.greater_equal(pc.struct_field(b, "xmax"), x0)),
            pc.and_(pc.less_equal(pc.struct_field(b, "ymin"), y1), pc.greater_equal(pc.struct_field(b, "ymax"), y0)))
        morceaux.append(t.filter(m))
    return pa.concat_tables(morceaux, promote_options="default") if morceaux else None


def nom_tuile_dem(lat, lon):
    la, lo = math.floor(lat), math.floor(lon)
    return (f"Copernicus_DSM_COG_10_{'N' if la >= 0 else 'S'}{abs(la):02d}_00_"
            f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00_DEM")


def telecharger_dem(bb, dossier):
    """Télécharge les tuiles Copernicus (1° x 1°) qui touchent la zone."""
    x0, y0, x1, y1 = bb
    noms = sorted({nom_tuile_dem(la, lo) for la in (y0, y1) for lo in (x0, x1)})
    for n in noms:
        dest = os.path.join(dossier, n + ".tif")
        if not os.path.exists(dest):
            url = f"https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"
            with urllib.request.urlopen(url, timeout=180) as r, open(dest + ".part", "wb") as f:
                f.write(r.read())
            os.replace(dest + ".part", dest)
    return noms


def extraire(fichier_ville, cache):
    ville = json.load(open(fichier_ville, encoding="utf-8"))
    os.makedirs(cache, exist_ok=True)
    dossier = os.path.join(cache, ville["id"])
    os.makedirs(dossier, exist_ok=True)
    bb = emprise(ville["centre"], ville["cote_km"] * MARGE)
    fs = s3()
    t0 = time.time()
    infos = {"release_overture": RELEASE_OVERTURE, "emprise_telechargee": bb, "themes": {}}
    for theme, (prefixe, colonnes) in THEMES.items():
        t = lire_zone(fs, index_theme(fs, prefixe, cache), colonnes, bb)
        if t is None:
            t = pa.table({"id": pa.array([], pa.string())})
        pq.write_table(t, os.path.join(dossier, f"{theme}.parquet"), compression="zstd")
        infos["themes"][theme] = t.num_rows
        print(f"  {theme}: {t.num_rows} éléments", flush=True)
    infos["tuiles_relief"] = telecharger_dem(bb, dossier)
    infos["duree_s"] = round(time.time() - t0, 1)
    json.dump(infos, open(os.path.join(dossier, "extraction.json"), "w"), indent=1)
    print(f"Extraction terminée en {infos['duree_s']} s -> {dossier}")
    return dossier


if __name__ == "__main__":
    extraire(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "cache")
