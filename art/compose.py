"""Registration Night plate. Builds the still composition for the mascot:
   plate-subject.png  grayscale tone plate (halftoned live in WebGL)
   plate-tech.png     hairline technical layer, white on transparent
   plate-proof.png    print proof of both, halftoned here for review
Run: python3 art/compose.py"""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.expanduser("~/.claude/skills/canvas-design/canvas-fonts")
S = 1600                       # plate size
SC = 0.8                       # subject scale inside the plate, leaves a margin for the instruments
OFF = (1 - SC) / 2
CX, CY = S * 0.5, S * (OFF + SC * 0.476)   # centre of the mascot's own ring
R = S * SC * 0.425                         # the mascot's ring radius

def font(name, px): return ImageFont.truetype(os.path.join(FONTS, name), px)

# ---------- subject ----------
def place(img):
    """Scale a square grayscale frame into the plate, leaving the instrument margin."""
    raw = img.convert("L").resize((int(S * SC), int(S * SC)), Image.LANCZOS)
    out = Image.new("L", (S, S), 0); out.paste(raw, (int(S * OFF), int(S * OFF)))
    return out

def levels_of(img):
    v = np.asarray(img).astype(np.float32)
    return np.percentile(v, 2), np.percentile(v, 99.5)

def find_ring(img, seed=3):
    """RANSAC a circle through the thin bright lines near where the mascot's ring should be.
    Each sprite sheet was drawn separately, so every frame has its own ring."""
    a = np.asarray(img).astype(np.float32)
    opened = np.asarray(img.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))).astype(np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    near = np.abs(np.hypot(xx - CX, yy - CY) - R) < 150
    ys, xs = np.nonzero(((a - opened) > 60) & near)
    rng = np.random.default_rng(seed)
    if len(xs) > 6000:
        keep = rng.choice(len(xs), 6000, replace=False); xs, ys = xs[keep], ys[keep]
    P = np.c_[xs, ys].astype(np.float64); best = (0, CX, CY, R)
    for _ in range(3000):
        (x1, y1), (x2, y2), (x3, y3) = P[rng.choice(len(P), 3, replace=False)]
        d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
        if abs(d) < 1e-6: continue
        ux = ((x1**2 + y1**2) * (y2 - y3) + (x2**2 + y2**2) * (y3 - y1) + (x3**2 + y3**2) * (y1 - y2)) / d
        uy = ((x1**2 + y1**2) * (x3 - x2) + (x2**2 + y2**2) * (x1 - x3) + (x3**2 + y3**2) * (x2 - x1)) / d
        r = math.hypot(x1 - ux, y1 - uy)
        if abs(r - R) > 110 or math.hypot(ux - CX, uy - CY) > 90: continue
        n = int((np.abs(np.hypot(P[:, 0] - ux, P[:, 1] - uy) - r) < 3).sum())
        if n > best[0]: best = (n, ux, uy, r)
    return best[1:]

def strip_ring(img, band=16, k=9):
    """Erase the mascot's own dashed ring and crosshair: thin bright lines in a band around the ring
    (and along the crosshair arms) give way to a morphological opening, so thick hair survives."""
    cx, cy, r = find_ring(img)
    opened = img.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    m = np.abs(np.hypot(xx - cx, yy - cy) - r) < band
    # crosshair arms: find the brightest thin row / column outside the figure, they run in to the face
    th = np.asarray(img).astype(np.float32) - np.asarray(opened).astype(np.float32)
    side = np.abs(xx - cx) > r * 0.7
    rows = (th * side).sum(1); y0 = int(cy - 80) + int(np.argmax(rows[int(cy - 80):int(cy + 80)]))
    top = yy < cy - r * 0.85
    cols = (th * top).sum(0); x0 = int(cx - 80) + int(np.argmax(cols[int(cx - 80):int(cx + 80)]))
    m |= (np.abs(yy - y0) < 14) & side
    m |= (np.abs(xx - x0) < 14) & (np.abs(yy - cy) > r * 0.85)
    mask = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    print(f"  ring at {cx:.0f},{cy:.0f} r {r:.0f}; crosshair at x {x0}, y {y0}")
    return Image.composite(opened, img, mask)

def tone_plate(img, lv):
    """Same tone curve for every frame, so a blink never changes the exposure."""
    img = strip_ring(img)
    lo, hi = lv
    a = np.clip((np.asarray(img).astype(np.float32) - lo) / max(hi - lo, 1), 0, 1)
    a = np.clip((a - 0.06) / 0.94, 0, 1) ** 1.08          # crush the near-black ground to true zero
    blur = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))).astype(np.float32) / 255
    a = np.clip(a + 0.2 * (a - blur), 0, 1)                 # local contrast, keeps eyes and lips decisive
    yy = np.linspace(0, 1, S)[:, None]
    a *= np.clip((S * (OFF + SC) - yy * S) / (S * 0.12), 0, 1)  # fade the cropped shoulder into the night
    return Image.fromarray((a * 255).astype(np.uint8))

src = place(Image.open(os.path.join(ROOT, "assets", "mascot-source.png")))
LV = levels_of(src)
subject = tone_plate(src, LV)
subject.save(os.path.join(HERE, "plate-subject.png"))

# ---------- technical layer (drawn at 2x then reduced for hairlines) ----------
K = 2; T = Image.new("LA", (S * K, S * K), (255, 0)); d = ImageDraw.Draw(T)
cx, cy, r = CX * K, CY * K, R * K
W = lambda alpha: (255, int(255 * alpha))
# registration marks in the four corners (circle + cross)
m = 70 * K
for (x, y) in [(m, m), (S * K - m, m), (m, S * K - m), (S * K - m, S * K - m)]:
    d.ellipse([x - 16 * K, y - 16 * K, x + 16 * K, y + 16 * K], outline=W(0.55), width=K)
    d.line([(x - 26 * K, y), (x + 26 * K, y)], fill=W(0.55), width=K)
    d.line([(x, y - 26 * K), (x, y + 26 * K)], fill=W(0.55), width=K)
# crop brackets around the profile
def bracket(x0, y0, x1, y1, s=26 * K, alpha=0.7):
    for (x, y, sx, sy) in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        d.line([(x, y), (x + sx * s, y)], fill=W(alpha), width=K); d.line([(x, y), (x, y + sy * s)], fill=W(alpha), width=K)
bracket(S * K * 0.20, S * K * 0.33, S * K * 0.47, S * K * 0.60)
tech = T.resize((S, S), Image.LANCZOS)
tech.convert("RGBA").save(os.path.join(HERE, "plate-tech.png"))

# ---------- proof: Night Press halftone of the subject + tech layer ----------
def press(img, pitch=6.0, angle=22, seed=7):
    lum = np.asarray(img).astype(np.float32) / 255
    out = Image.new("RGB", (S, S), (7, 9, 54)); od = ImageDraw.Draw(out)
    ink, paper = np.array([59, 66, 214]), np.array([236, 238, 255])
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    rng = np.random.default_rng(seed); n = int(S * 0.75 / pitch) + 2
    for j in range(-n, n + 1):
        for i in range(-n, n + 1):
            u, v = i * pitch, j * pitch
            x = S / 2 + u * ca - v * sa + (rng.random() - .5) * pitch * .25
            y = S / 2 + u * sa + v * ca + (rng.random() - .5) * pitch * .25
            if not (0 <= x < S and 0 <= y < S): continue
            t = round(float(lum[int(y), int(x)]) ** 1.15 * 6) / 6
            if t < .04: continue
            rad = pitch * .5 * math.sqrt(t) * 1.42
            k = min(max((t - .4) / .55, 0), 1); k = k * k * (3 - 2 * k)
            c = tuple(int(v) for v in ink + (paper - ink) * k)
            od.ellipse([x - rad, y - rad, x + rad, y + rad], fill=c)
    return out
proof = press(subject)
lines = Image.new("RGBA", (S, S), (236, 238, 255, 0)); lines.putalpha(tech.getchannel("A"))
proof.paste(lines, (0, 0), lines)
proof.save(os.path.join(HERE, "plate-proof.png"))

# ship the two layers the site needs, at web size
os.makedirs(os.path.join(ROOT, "site", "assets"), exist_ok=True)
subject.resize((1024, 1024), Image.LANCZOS).save(os.path.join(ROOT, "site", "assets", "plate-subject.png"), optimize=True)
tech.resize((1024, 1024), Image.LANCZOS).save(os.path.join(ROOT, "site", "assets", "plate-tech.png"), optimize=True)
# ---------- sprite frames: blink and sleep ----------
# Drop the two 3-frame sheets in assets/sprites/ as blink.(png|jpg|webp) and sleep.(...).
# Each frame is registered to the open frame (translation + scale) so the plate never jumps.
import json, glob
from sprites import frames_from_sheets
from eyes import eyes_only
frames = frames_from_sheets(os.path.join(ROOT, "assets", "sprites"), Image.open(os.path.join(ROOT, "assets", "mascot-source.png")))
manifest, plates = {}, {}
if frames:
    ref = place(frames["open"]); lv = levels_of(ref)
    for name, im in frames.items():
        plates[name] = tone_plate(place(im), lv).resize((1024, 1024), Image.LANCZOS)
    # blink frames keep only their eyes; the rest is the open frame, so nothing else moves
    for name in ("blink-half", "blink-closed"):
        plates[name] = eyes_only(plates["open"], plates[name])
    for name, im in plates.items():
        im.save(os.path.join(ROOT, "site", "assets", f"face-{name}.jpg"), quality=92)
        manifest[name] = f"assets/face-{name}.jpg"
    print("frames:", ", ".join(manifest))
    json.dump(manifest, open(os.path.join(ROOT, "site", "assets", "frames.json"), "w"), indent=2)
else:
    print("no sprite sheets in assets/sprites; keeping the existing face frames")
print("plate built")
proof.convert("RGB").resize((800, 800), Image.LANCZOS).save(os.path.join(ROOT, "site", "assets", "plate-fallback.png"), optimize=True)
