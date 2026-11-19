"""Slice the mascot sprite sheets and register every frame to the open-eyed frame.

blink sheet: open, half-closed, closed            -> open, blink-half, blink-closed
sleep sheet: open, drowsy, asleep with head down  -> (open), sleep-half, sleep
"""
import glob, os
import numpy as np
from PIL import Image

def _find(folder, stem):
    hits = [f for f in glob.glob(os.path.join(folder, stem + ".*")) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    return hits[0] if hits else None

def _slice(path):
    sheet = Image.open(path).convert("L")
    w, h = sheet.size; fw = w / 3
    out = []
    for i in range(3):
        cx = fw * (i + 0.5); half = min(fw, h) / 2
        out.append(sheet.crop((int(cx - half), int(h / 2 - half), int(cx + half), int(h / 2 + half))).resize((1024, 1024), Image.LANCZOS))
    return out

def _arr(im, n=256):
    a = np.asarray(im.resize((n, n), Image.LANCZOS)).astype(np.float32)
    a -= a.mean(); return a * np.outer(np.hanning(n), np.hanning(n))

def _shift(ref, mov):
    """Phase correlation: integer-pixel shift that best lays mov onto ref, plus peak strength."""
    F = np.fft.fft2(ref) * np.conj(np.fft.fft2(mov)); F /= np.abs(F) + 1e-6
    c = np.real(np.fft.ifft2(F)); y, x = np.unravel_index(np.argmax(c), c.shape)
    n = ref.shape[0]
    return (x if x < n / 2 else x - n), (y if y < n / 2 else y - n), c.max()

def _apply(im, s, dx, dy):
    sz = int(round(1024 * s)); scaled = im.resize((sz, sz), Image.LANCZOS)
    out = Image.new("L", (1024, 1024), 0); out.paste(scaled, ((1024 - sz) // 2 + dx, (1024 - sz) // 2 + dy))
    return out

def register(ref_im, mov_im):
    """Best (scale 0.92..1.08, shift) that lays mov_im onto ref_im."""
    ref = _arr(ref_im); best = None
    for s in np.linspace(0.92, 1.08, 17):
        dx, dy, peak = _shift(ref, _arr(_apply(mov_im, s, 0, 0)))
        if best is None or peak > best[0]: best = (peak, float(s), int(round(dx * 4)), int(round(dy * 4)))
    return best[1:]

def frames_from_sheets(folder, anchor):
    """anchor: the original mascot image; every frame is laid onto it so the technical layer still fits."""
    blink, sleep = _find(folder, "blink"), _find(folder, "sleep")
    if not blink or not sleep: return {}
    b, z = _slice(blink), _slice(sleep)
    ref = anchor.convert("L").resize((1024, 1024), Image.LANCZOS)
    tb = register(ref, b[0]); print(f"  blink sheet -> mascot: scale {tb[0]:.3f}, shift {tb[1]},{tb[2]}px")
    tz = register(ref, z[0]); print(f"  sleep sheet -> mascot: scale {tz[0]:.3f}, shift {tz[1]},{tz[2]}px")
    # one transform per sheet (from its open frame) so the moving eyes and the lowered head are never "corrected"
    return {
        "open": _apply(b[0], *tb), "blink-half": _apply(b[1], *tb), "blink-closed": _apply(b[2], *tb),
        "sleep-half": _apply(z[1], *tz), "sleep": _apply(z[2], *tz),
    }
