#!/usr/bin/env python3
"""Mix light-group EXRs of one view into a tone-mapped PNG so you can judge a render before encoding.

Usage:
  python preview_exr.py <view_dir> <out.png> [--mix sun=1,sky=0.8,candle=0.3] [--exposure 0.62]
Without --mix every pass is added at weight 1. Prints each pass's mean and 99.9th percentile,
which is how you spot a light that is far too strong or empty.
"""
import argparse, glob, os
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("dir"); ap.add_argument("out")
ap.add_argument("--mix", default="")
ap.add_argument("--exposure", type=float, default=0.62, help="matches relight-viewer.html's exposureScale at 0 EV")
a = ap.parse_args()

files = sorted(glob.glob(os.path.join(a.dir, "*.exr")))
weights = {k: float(v) for k, v in (kv.split("=") for kv in a.mix.split(",") if kv)} if a.mix else None
acc = None
for f in files:
    name = os.path.basename(f)[:-4]
    name = name[:-4] if name.endswith("0001") else name
    if weights is not None and name not in weights:
        continue
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED)[:, :, :3][:, :, ::-1].astype(np.float32)
    print(f"{name:12s} mean {im.mean(axis=(0, 1)).round(4)}  p99.9 {np.percentile(im, 99.9):.3f}")
    im *= weights[name] if weights else 1.0
    acc = im if acc is None else acc + im
if acc is None:
    raise SystemExit("no matching EXR passes")
x = acc * a.exposure
y = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)  # ACES fit
y = np.where(y <= 0.0031308, y * 12.92, 1.055 * np.power(y, 1 / 2.4) - 0.055)
cv2.imwrite(a.out, (np.clip(y, 0, 1)[:, :, ::-1] * 255 + 0.5).astype(np.uint8))
print("saved", a.out)
