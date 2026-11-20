"""Talking frames carry only their lips: everything else is the open frame, so nothing but the mouths move.

The talk sheet (assets/sprites/talk.png: closed, half open, open) is a separate render, so hair, edges and
glitch blocks drift a few pixels against the blink sheet. Each mouth is registered on its own (a small
phase-correlation window around it), tone-matched, and pasted onto the open frame through a feathered mask.
Called from sprites.frames_from_sheets; works in sprite space, before the frames are placed in the plate.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# mouth ellipses in the registered 1024px sprite frame (left profile, right front-facing)
MOUTHS = [(214, 556, 312, 640), (480, 618, 600, 690)]
WIN = 160  # registration window around each mouth

def _win(im, cx, cy):
    a = np.asarray(im.crop((cx - WIN // 2, cy - WIN // 2, cx + WIN // 2, cy + WIN // 2))).astype(np.float32)
    a -= a.mean(); return a * np.outer(np.hanning(WIN), np.hanning(WIN))

def _local_shift(ref, mov, cx, cy):
    F = np.fft.fft2(_win(ref, cx, cy)) * np.conj(np.fft.fft2(_win(mov, cx, cy))); F /= np.abs(F) + 1e-6
    c = np.real(np.fft.ifft2(F)); y, x = np.unravel_index(np.argmax(c), c.shape)
    dx, dy = (x if x < WIN / 2 else x - WIN), (y if y < WIN / 2 else y - WIN)
    return (int(dx), int(dy)) if abs(dx) < 24 and abs(dy) < 24 else (0, 0)

def mouth_mask(box, size=1024, feather=9):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather))

def talk_frames(open_im, talk):
    """open_im: the registered open frame (L). talk: the three registered talk frames. -> [talk-1, talk-2]."""
    out = [open_im.convert("L").copy() for _ in talk[1:]]
    for box in MOUTHS:
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        dx, dy = _local_shift(open_im, talk[0], cx, cy)   # the closed talk mouth onto the open frame's mouth
        print(f"  mouth at {cx},{cy}: local shift {dx},{dy}px")
        mask = mouth_mask(box)
        ring = np.asarray(mask) > 8
        o = np.asarray(open_im).astype(np.float32)[ring]
        for k, src in enumerate(talk[1:]):
            moved = Image.new("L", src.size, 0); moved.paste(src, (dx, dy))
            # match the closed talk frame's tone in this patch to the open frame's
            base = Image.new("L", src.size, 0); base.paste(talk[0], (dx, dy))
            b = np.asarray(base).astype(np.float32)[ring]
            gain = (o.std() + 1e-3) / (b.std() + 1e-3); off = o.mean() - b.mean() * gain
            a = np.clip(np.asarray(moved).astype(np.float32) * gain + off, 0, 255).astype(np.uint8)
            out[k] = Image.composite(Image.fromarray(a), out[k], mask)
    return out
