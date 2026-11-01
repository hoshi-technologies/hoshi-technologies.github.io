"""Lecture des tuiles Copernicus DEM (GeoTIFF, compression DEFLATE + prédicteur flottant)
sans dépendance lourde : seulement tifffile, zlib et numpy."""
import io, zlib, numpy as np, tifffile

def read_dem(data: bytes) -> np.ndarray:
    with tifffile.TiffFile(io.BytesIO(data)) as tf:
        p = tf.pages[0]
        H, W, th, tw = p.imagelength, p.imagewidth, p.tilelength, p.tilewidth
        out = np.zeros((H, W), np.float32)
        ntx = (W + tw - 1) // tw
        for i, (off, n) in enumerate(zip(p.dataoffsets, p.databytecounts)):
            raw = np.frombuffer(zlib.decompress(data[off:off + n]), np.uint8).reshape(th, tw * 4)
            raw = np.cumsum(raw, axis=1, dtype=np.uint8)            # annule la différence horizontale
            f = raw.reshape(th, 4, tw).transpose(0, 2, 1).copy().view(">f4")[..., 0]  # recombine les octets
            ty, tx = divmod(i, ntx)
            y, x = ty * th, tx * tw
            out[y:y + th, x:x + tw] = f[:min(th, H - y), :min(tw, W - x)]
        return out
