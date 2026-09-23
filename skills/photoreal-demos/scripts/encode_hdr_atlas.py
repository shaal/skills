#!/usr/bin/env python3
"""Pack per-light-group HDR EXRs into one WebP atlas per view, plus manifest.json, for assets/relight-viewer.html.

Input layout (what scripts/blender_relight_template.py writes):
    <src>/v00/<pass>.exr, <src>/v01/<pass>.exr, ...     one folder per camera view or time step
    <src>/<pass>.exr                                     a single view also works
Blender 4.x names (<pass>0001.exr) are accepted too.

HDR survives 8-bit WebP through an invertible curve, with one scale per pass shared by every view
(so cross-fades between views stay consistent). The scale is p99.9 / 6 of luminance, kept between
1x and 4x the pass mean. Too low a scale pushes highlights into the steep top of the curve, where WebP's
4:2:0 chroma turns into colour blocks and speckle. Too high a scale (a tiny, very bright flame) leaves dim
areas with few codes, which bands once the viewer raises that light.
    x = linear / scale;  y = x / (1 + x);  stored = y ** (1 / 2.2)
    viewer: y = v ** 2.2;  linear = scale * y / (1 - y)

Usage:
  python encode_hdr_atlas.py <src_dir> <out_dir> [--passes sun,sky,candle] [--quality 92] [--max-width 1440]

Needs: pip install numpy opencv-python pillow   (EXR reading uses OpenCV with OPENCV_IO_ENABLE_OPENEXR=1)
"""
import argparse, glob, json, math, os, sys
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2, numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--passes", help="comma-separated pass names in atlas order (default: every EXR in the first view, sorted)")
ap.add_argument("--quality", type=int, default=92)
ap.add_argument("--max-width", type=int, default=0, help="downscale each tile to this width (0 keeps the render size)")
ap.add_argument("--headroom", type=float, default=6.0, help="scale = p99.9 / headroom, clamped to [mean, 4 x mean]. Raise it if dim areas band; lower it if highlights show colour blocks or halos")
ap.add_argument("--lossless", action="store_true", help="lossless WebP (about 4x larger; no chroma artifacts)")
a = ap.parse_args()


def exr(d, name):
    for fn in (f"{name}.exr", f"{name}0001.exr"):
        if os.path.exists(os.path.join(d, fn)):
            return os.path.join(d, fn)
    return None


views = sorted(d for d in glob.glob(os.path.join(a.src, "*")) if os.path.isdir(d) and glob.glob(os.path.join(d, "*.exr")))
if not views and glob.glob(os.path.join(a.src, "*.exr")):
    views = [a.src]
if not views:
    sys.exit(f"no EXR files under {a.src}")
if a.passes:
    passes = [p.strip() for p in a.passes.split(",") if p.strip()]
else:
    names = sorted({os.path.basename(f)[:-4] for f in glob.glob(os.path.join(views[0], "*.exr"))})
    passes = sorted({n[:-4] if n.endswith("0001") else n for n in names})
complete = [v for v in views if all(exr(v, p) for p in passes)]
if len(complete) < len(views):
    print(f"skipping {len(views) - len(complete)} incomplete view folder(s)")
views = complete
os.makedirs(a.out, exist_ok=True)


def load(v, p):
    im = cv2.imread(exr(v, p), cv2.IMREAD_UNCHANGED)
    if im is None:
        sys.exit(f"cannot read {exr(v, p)} (is OpenCV built with OpenEXR?)")
    im = np.maximum(im[:, :, :3][:, :, ::-1].astype(np.float32), 0.0)
    if a.max_width and im.shape[1] > a.max_width:
        h = round(im.shape[0] * a.max_width / im.shape[1])
        im = cv2.resize(im, (a.max_width, h), interpolation=cv2.INTER_AREA)
    return im


LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)
scales = {}
for p in passes:
    lums = [load(v, p) @ LUM for v in views]
    mean = float(np.mean([l.mean() for l in lums])); p999 = float(np.percentile(np.concatenate([l.ravel()[::7] for l in lums]), 99.9))
    scales[p] = max(min(max(p999 / a.headroom, mean), 4 * mean), 1e-5)
if len(passes) > 8:
    print(f"warning: {len(passes)} passes; assets/relight-viewer.html shows at most 8 light groups")
cols = math.ceil(math.sqrt(len(passes))); rows = math.ceil(len(passes) / cols)

total = 0
for i, v in enumerate(views):
    tiles = []
    for p in passes:
        x = load(v, p) / scales[p]
        y = x / (1.0 + x)
        tiles.append(np.clip(np.power(y, 1 / 2.2) * 255 + 0.5, 0, 255).astype(np.uint8))
    h, w = tiles[0].shape[:2]
    atlas = np.zeros((h * rows, w * cols, 3), np.uint8)
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols)
        atlas[r * h:(r + 1) * h, c * w:(c + 1) * w] = t
    fn = os.path.join(a.out, f"v{i:02d}.webp")
    Image.fromarray(atlas).save(fn, "WEBP", quality=100 if a.lossless else a.quality, lossless=a.lossless, method=6, exact=True)
    total += os.path.getsize(fn)
    print(f"{fn}  {os.path.getsize(fn) / 1024:.0f} KB")

if max(w * cols, h * rows) > 4096:
    print(f"warning: atlas is {w * cols}x{h * rows}; many phones cap textures at 4096 px. Re-run with --max-width {4096 // cols}")
manifest = {"views": len(views), "width": w, "height": h, "cols": cols, "rows": rows, "passes": passes, "scales": scales,
            "encoding": "reinhard-gamma2.2"}
json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=1)
print(json.dumps(manifest))
print(f"total {total / 1e6:.1f} MB for {len(views)} view(s) x {len(passes)} pass(es)")
