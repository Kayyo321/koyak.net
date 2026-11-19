"""Blink frames carry only their eyes: everything else is the open frame, so nothing but the lids moves.

The sheet frames are separate renders, so hair, edges and glitch blocks drift a few pixels between them.
We paste each blink frame's eyes onto the open frame through a feathered mask.

  python3 art/eyes.py     # rewrites site/assets/face-blink-*.jpg in place from face-open.jpg
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# eye ellipses in the 1024px frame (left profile eye, right front-facing eye)
EYES = [(318, 396, 448, 506), (508, 418, 662, 516)]

def eye_mask(size=1024, feather=14):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    for box in EYES: d.ellipse(box, fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather))

def eyes_only(open_im, frame_im):
    return Image.composite(frame_im.convert("L"), open_im.convert("L"), eye_mask(open_im.size[0]))

if __name__ == "__main__":
    A = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site", "assets")
    base = Image.open(os.path.join(A, "face-open.jpg"))
    for n in ("blink-half", "blink-closed"):
        p = os.path.join(A, f"face-{n}.jpg")
        src = os.path.join(A, f".face-{n}.orig.jpg")
        if not os.path.exists(src): os.replace(p, src)  # keep the original render once
        eyes_only(base, Image.open(src)).save(p, quality=92)
        print("wrote", p)
