"""The send button's paper airplane: cut from assets/plane-source.webp (already on transparent),
cropped to the paper, and written as a grey + alpha plate that site/plane.js halftones live.
  python3 art/plane.py"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(ROOT, "assets", "plane-source.webp")).convert("RGBA")
a = src.getchannel("A").point(lambda v: 255 if v > 24 else 0)
box = a.getbbox()
pad = 24
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(src.width, box[2] + pad), min(src.height, box[3] + pad))
im = src.crop(box)
grey = ImageOps.autocontrast(im.convert("L"), cutoff=(1, 0))  # the folds keep their shade, the paper reads white
out = Image.merge("LA", (grey, im.getchannel("A")))
w = 640
out = out.resize((w, round(out.height * w / out.width)), Image.LANCZOS)
out.save(os.path.join(ROOT, "site", "assets", "plane.png"), optimize=True)
print("plane.png", out.size, "aspect", round(out.width / out.height, 4))
