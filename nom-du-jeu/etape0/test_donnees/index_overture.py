"""Construit un index (fichier, groupe de lignes, emprise) des données Overture.
Permet ensuite de ne lire que les morceaux qui touchent une ville.
Usage : python index_overture.py RELEASE DOSSIER_CACHE"""
import os, sys, json, time
from concurrent.futures import ThreadPoolExecutor
import pyarrow.fs as pafs, pyarrow.parquet as pq

RELEASE = sys.argv[1] if len(sys.argv) > 1 else "2026-10-21.0"
CACHE = sys.argv[2] if len(sys.argv) > 2 else "cache"
THEMES = {
    "building": "theme=buildings/type=building",
    "segment": "theme=transportation/type=segment",
    "water": "theme=base/type=water",
    "land_use": "theme=base/type=land_use",
}

def s3():
    proxy = os.environ.get("HTTPS_PROXY")
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", proxy_options=proxy) if proxy \
        else pafs.S3FileSystem(anonymous=True, region="us-west-2")

def index_file(fs, path):
    md = pq.ParquetFile(fs.open_input_file(path)).metadata
    names = [md.schema.column(i).path for i in range(md.num_columns)]
    cols = {k: names.index(f"bbox.{k}") for k in ("xmin", "xmax", "ymin", "ymax")}
    out = []
    for rg in range(md.num_row_groups):
        r = md.row_group(rg)
        st = {k: r.column(i).statistics for k, i in cols.items()}
        out.append([rg, r.num_rows, st["xmin"].min, st["xmax"].max, st["ymin"].min, st["ymax"].max,
                    r.total_byte_size])
    return out

def main():
    os.makedirs(CACHE, exist_ok=True)
    fs = s3()
    for theme, prefix in THEMES.items():
        dest = os.path.join(CACHE, f"index_{theme}_{RELEASE}.json")
        if os.path.exists(dest):
            continue
        t = time.time()
        base = f"overturemaps-us-west-2/release/{RELEASE}/{prefix}/"
        files = [f.path for f in fs.get_file_info(pafs.FileSelector(base)) if f.path.endswith(".parquet")]
        with ThreadPoolExecutor(16) as ex:
            idx = dict(zip(files, ex.map(lambda p: index_file(fs, p), files)))
        json.dump(idx, open(dest, "w"))
        print(f"{theme}: {len(files)} fichiers indexés en {time.time()-t:.0f} s")

if __name__ == "__main__":
    main()
