"""Test de préparation des données sur 20 villes (zone 'Quartier', 4 x 4 km par défaut).
Mesure : contenu, qualité indicative, poids, temps. Sources : Overture Maps + Copernicus DEM GLO-30.
Prérequis : python index_overture.py (une fois).
Usage : python test_villes.py [cote_km] [dossier_cache] [dossier_sortie]"""
import os, sys, json, math, time, urllib.request
import pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc, pyarrow.fs as pafs
import shapely, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lire_dem import read_dem

RELEASE = "2026-10-21.0"
COTE_KM = float(sys.argv[1]) if len(sys.argv) > 1 else 4.0
CACHE = sys.argv[2] if len(sys.argv) > 2 else "cache"
OUT = sys.argv[3] if len(sys.argv) > 3 else "sortie"
HERE = os.path.dirname(os.path.abspath(__file__))
COLS = {
    "building": ["id", "geometry", "bbox", "sources", "height", "num_floors", "class"],
    "segment": ["id", "geometry", "bbox", "subtype", "class", "names"],
    "water": ["id", "geometry", "bbox", "subtype", "class"],
    "land_use": ["id", "geometry", "bbox", "subtype", "class"],
}

def s3():
    p = os.environ.get("HTTPS_PROXY")
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", proxy_options=p) if p \
        else pafs.S3FileSystem(anonymous=True, region="us-west-2")

def bbox_of(lat, lon, km):
    dlat = km / 2 / 111.32
    dlon = km / 2 / (111.32 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat

def read_theme(fs, theme, bb, index):
    x0, y0, x1, y1 = bb
    parts, nbytes = [], 0
    for path, rgs in index.items():
        hits = [r for r in rgs if r[2] <= x1 and r[3] >= x0 and r[4] <= y1 and r[5] >= y0]
        if not hits:
            continue
        nbytes += sum(r[6] for r in hits)
        pf = pq.ParquetFile(fs.open_input_file(path))
        t = pf.read_row_groups([r[0] for r in hits], columns=COLS[theme])
        b = t.column("bbox")
        m = pc.and_(pc.and_(pc.less_equal(pc.struct_field(b, "xmin"), x1), pc.greater_equal(pc.struct_field(b, "xmax"), x0)),
                    pc.and_(pc.less_equal(pc.struct_field(b, "ymin"), y1), pc.greater_equal(pc.struct_field(b, "ymax"), y0)))
        parts.append(t.filter(m))
    return (pa.concat_tables(parts) if parts else None), nbytes

def dem_crop(lat, lon, bb):
    """Télécharge la tuile Copernicus GLO-30 (1° x 1°) et découpe la zone de jeu."""
    la, lo = math.floor(lat), math.floor(lon)
    name = f"Copernicus_DSM_COG_10_{'N' if la>=0 else 'S'}{abs(la):02d}_00_{'E' if lo>=0 else 'W'}{abs(lo):03d}_00_DEM"
    url = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
    t = time.time()
    try:
        data = urllib.request.urlopen(url, timeout=120).read()
    except Exception as e:
        return {"relief": "absent", "relief_erreur": str(e)[:60]}, None
    arr = read_dem(data)
    h, w = arr.shape
    x0, y0, x1, y1 = bb
    c0, c1 = int((x0 - lo) * w), int(math.ceil((x1 - lo) * w))
    r0, r1 = int((la + 1 - y1) * h), int(math.ceil((la + 1 - y0) * h))
    sub = arr[max(r0, 0):min(r1, h), max(c0, 0):min(c1, w)]
    return {"relief_tuile_Mo": round(len(data) / 1e6, 1), "relief_s": round(time.time() - t, 1),
            "alt_min_m": round(float(sub.min())), "alt_max_m": round(float(sub.max()))}, sub

def lengths_km(geoms, lat):
    k = math.cos(math.radians(lat))
    tot = 0.0
    for line in shapely.from_wkb(geoms):
        c = shapely.get_coordinates(line)
        if len(c) > 1:
            d = np.diff(c, axis=0); d[:, 0] *= k
            tot += np.sqrt((d ** 2).sum(1)).sum() * 111.32
    return tot

def city(fs, idx, c):
    t0 = time.time()
    bb = bbox_of(c["lat"], c["lon"], COTE_KM)
    area = COTE_KM ** 2
    tabs, lus = {}, 0
    for th in COLS:
        tabs[th], n = read_theme(fs, th, bb, idx[th]); lus += n
    t_vec = time.time() - t0
    r = {"ville": c["nom"], "pays": c["pays"], "type": c["type"], "zone_km2": area}
    b = tabs["building"]
    nb = b.num_rows if b else 0
    r["batiments"] = nb
    r["batiments_par_km2"] = round(nb / area)
    if nb:
        src = [s[0]["dataset"] if s else "?" for s in b.column("sources").to_pylist()]
        r["pct_bat_osm"] = round(100 * sum(1 for s in src if s == "OpenStreetMap") / nb)
        r["pct_bat_detectes_par_ia"] = round(100 * sum(1 for s in src if "ML" in s or "Google" in s or "Esri" in s) / nb)
        r["sources_batiments"] = sorted(set(src))
        hv = pc.or_(pc.is_valid(b.column("height")), pc.is_valid(b.column("num_floors")))
        r["pct_bat_avec_hauteur"] = round(100 * pc.sum(pc.cast(hv, pa.int32())).as_py() / nb)
    else:
        r.update(pct_bat_osm=0, pct_bat_detectes_par_ia=0, pct_bat_avec_hauteur=0, sources_batiments=[])
    s = tabs["segment"]
    if s:
        roads = s.filter(pc.equal(s.column("subtype"), "road"))
        r["troncons_routes"] = roads.num_rows
        r["km_routes"] = round(lengths_km(roads.column("geometry").to_pylist(), c["lat"]), 1)
        names = roads.column("names").to_pylist()
        r["pct_routes_nommees"] = round(100 * sum(1 for n in names if n and n.get("primary")) / max(roads.num_rows, 1))
        r["km_rail"] = round(lengths_km(s.filter(pc.equal(s.column("subtype"), "rail")).column("geometry").to_pylist(), c["lat"]), 1)
    else:
        r.update(troncons_routes=0, km_routes=0, pct_routes_nommees=0, km_rail=0)
    r["elements_eau"] = tabs["water"].num_rows if tabs["water"] else 0
    r["elements_occupation_sol"] = tabs["land_use"].num_rows if tabs["land_use"] else 0
    r["vecteur_lu_Mo"] = round(lus / 1e6)
    r["vecteur_s"] = round(t_vec, 1)
    d, dem = dem_crop(c["lat"], c["lon"], bb)
    r.update(d)
    # Paquet de ville : ce que le joueur téléchargerait (données filtrées compressées + relief découpé)
    os.makedirs(OUT, exist_ok=True)
    slug = "".join(ch for ch in c["nom"] if ch.isalnum())[:24]
    size = 0
    for th, t in tabs.items():
        if t is not None and t.num_rows:
            p = os.path.join(OUT, f"{slug}_{th}.parquet")
            pq.write_table(t.drop(["bbox"]), p, compression="zstd", compression_level=9)
            size += os.path.getsize(p)
    if dem is not None:
        p = os.path.join(OUT, f"{slug}_relief.npz"); np.savez_compressed(p, dem=dem.astype(np.float16))
        size += os.path.getsize(p)
    r["paquet_ville_Mo"] = round(size / 1e6, 2)
    r["temps_total_s"] = round(time.time() - t0, 1)
    # Note indicative de qualité (0-100). Formule expliquée dans le rapport de validation.
    q = (25 * min(1, r["batiments_par_km2"] / 400) + 20 * r["pct_bat_osm"] / 100 + 15 * r["pct_bat_avec_hauteur"] / 100
         + 20 * r["pct_routes_nommees"] / 100 + 20 * min(1, r["km_routes"] / area / 8))
    r["note_qualite"] = round(q)
    print(f'{r["ville"]:<22} bât={nb:>6} osm={r["pct_bat_osm"]:>3}% ia={r["pct_bat_detectes_par_ia"]:>3}% '
          f'haut={r["pct_bat_avec_hauteur"]:>3}% routes={r["km_routes"]:>6}km nom={r["pct_routes_nommees"]:>3}% '
          f'note={r["note_qualite"]:>3} paquet={r["paquet_ville_Mo"]}Mo t={r["temps_total_s"]}s', flush=True)
    return r

def main():
    fs = s3()
    idx = {th: json.load(open(os.path.join(CACHE, f"index_{th}_{RELEASE}.json"))) for th in COLS}
    villes = json.load(open(os.path.join(HERE, "villes_test.json"), encoding="utf-8"))
    res = []
    for c in villes:   # en série, pour mesurer le temps de chaque ville
        try:
            res.append(city(fs, idx, c))
        except Exception as e:
            print("ERREUR", c["nom"], repr(e), flush=True); res.append({"ville": c["nom"], "erreur": repr(e)})
    json.dump({"release_overture": RELEASE, "cote_km": COTE_KM, "resultats": res},
              open(os.path.join(HERE, f"resultats_{int(COTE_KM)}km.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
