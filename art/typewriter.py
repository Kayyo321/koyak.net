"""Typewriter plate for the site.

From assets/typewriter-source.webp (transparent background) this writes:
  site/assets/typewriter.png   the machine, grayscale + alpha, with the paper cut out so a live sheet
                               can sit behind the bail, ribbon and type guide
  site/assets/typewriter.json  key centres, space bar, return lever, paper rect, print line, typebar fan

  python3 art/typewriter.py
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
src = Image.open(os.path.join(ROOT, "assets", "typewriter-source.webp")).convert("RGBA")
W, H = src.size
L = np.asarray(src.convert("L")).astype(np.float32)
A = np.asarray(src.getchannel("A")).astype(np.float32)

# ---------- paper: bright pixels inside the sheet's rect, minus the type guide that stands in front ----------
PX0, PX1, PY0, PY1 = 276, 1004, 40, 393
yy, xx = np.mgrid[0:H, 0:W]
inside = (xx >= PX0) & (xx <= PX1) & (yy >= PY0) & (yy <= PY1)
guide = (xx > 560) & (xx < 700) & (yy > 350)
paper = inside & (L > 132) & ~(guide & (L < 215))
pm = Image.fromarray((paper * 255).astype(np.uint8))
pm = pm.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # drop specks in the rod and ribbon
pm = pm.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # eat the bright fringe at the edge
alpha = A * (1 - np.asarray(pm).astype(np.float32) / 255)
alpha[(yy < 186) & (xx >= PX0 - 8) & (xx <= PX1 + 10)] = 0   # above the carriage there is only the sheet (and its edge shadow)

machine = Image.merge("LA", (src.convert("L"), Image.fromarray(alpha.clip(0, 255).astype(np.uint8))))
machine.save(os.path.join(ROOT, "site", "assets", "typewriter.png"), optimize=True)

# ---------- keys: ring template matching (radius 25) over the keyboard ----------
reg = L[780:1100, 200:1060] / 255
r = 25; n = 2 * r + 9
ty, tx = np.mgrid[:n, :n] - n // 2
T = (np.abs(np.hypot(tx, ty) - r) < 1.6).astype(np.float32); T -= T.mean()
h, w = reg.shape
c = np.fft.irfft2(np.fft.rfft2(reg - reg.mean(), s=(h + n, w + n)) * np.fft.rfft2(T[::-1, ::-1], s=(h + n, w + n)),
                  s=(h + n, w + n))[n // 2:n // 2 + h, n // 2:n // 2 + w]
pts, c2 = [], c.copy()
while True:
    y, x = np.unravel_index(np.argmax(c2), c2.shape)
    if c2[y, x] < c.max() * 0.45: break
    pts.append((int(x) + 200, int(y) + 780)); c2[max(0, y - 30):y + 30, max(0, x - 30):x + 30] = -1e9
rows = {}
for x, y in pts: rows.setdefault(round(y / 70), []).append((x, y))
rows = [sorted(v) for _, v in sorted(rows.items())]
LABELS = ["1234567890=", "QWERTYUIOP", "ASDFGHJKL;", "ZXCVBNM,."]
assert [len(r_) for r_ in rows] == [len(s) for s in LABELS], [len(r_) for r_ in rows]
keys = [{"k": ch, "x": x, "y": y} for row, labels in zip(rows, LABELS) for ch, (x, y) in zip(labels, row)]

# ---------- typebar fan: the slot arc and the rest ends of the bars share one centre ----------
fan = {"cx": 627, "cy": 302, "pivot": 413, "rest": 172, "a0": 48, "a1": 132}

meta = {
    "size": [W, H],
    "paper": {"x0": PX0, "x1": PX1, "top": 46, "feed": PY1},  # feed: where the sheet goes into the platen
    "print": {"y": 352, "x0": PX0 + 58, "x1": PX1 - 58, "cols": 24, "line": 58},
    "keys": keys, "keyR": 27,
    "space": {"x0": 262, "x1": 990, "y0": 1098, "y1": 1156},
    "lever": {"x0": 36, "x1": 212, "y0": 318, "y1": 616},
    "fan": fan,
}
json.dump(meta, open(os.path.join(ROOT, "site", "assets", "typewriter.json"), "w"), indent=1)
print(f"typewriter: {len(keys)} keys, paper cut out, {W}x{H}")
