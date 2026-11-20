#!/usr/bin/env python3
"""Build the paper's contextual Latin handwriting from Kalam with FontTools."""

from math import hypot
from pathlib import Path
from string import ascii_letters, digits

from fontTools import subset
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates


FONTS = Path(__file__).resolve().parents[1] / "site" / "fonts"

# Width, height, slant, baseline, bend, and pressure describe different pen movements.
STROKES = (
    (0.92, 1.07, -0.20, -37, 0.29, 7),
    (1.14, 0.94, 0.16, 38, -0.24, -5),
    (1.03, 1.11, 0.05, -24, -0.32, 4),
    (0.94, 0.93, -0.06, 53, 0.24, -4),
)


def add_stroke(font, original, alternate, stroke):
    glyf = font["glyf"]
    glyph = glyf[original]
    points, contours, flags = glyph.getCoordinates(glyf)
    mid_x = (glyph.xMin + glyph.xMax) / 2
    width = glyph.xMax - glyph.xMin
    height = glyph.yMax - glyph.yMin
    mid_y = (glyph.yMin + glyph.yMax) / 2
    spread, rise, slant, baseline, bend, pressure = stroke

    # Move each contour along its normal to vary ink weight, including the holes in letters.
    positions = []
    start = 0
    for end in contours:
        contour = points[start:end + 1]
        start = end + 1
        for index, (x, y) in enumerate(contour):
            before = contour[index - 1]
            after = contour[(index + 1) % len(contour)]
            dx, dy = after[0] - before[0], after[1] - before[1]
            strength = pressure / max(hypot(dx, dy), 1)
            positions.append((
                round(mid_x + (x - mid_x) * spread + (y - mid_y) * slant
                      + width * bend * (((y - mid_y) / height) ** 2 - 0.12) - dy * strength),
                round(y * rise + baseline
                      - height * bend * (((x - mid_x) / width) ** 2 - 0.12) + dx * strength),
            ))

    altered = Glyph()
    altered.numberOfContours = len(contours)
    altered.endPtsOfContours = contours
    altered.flags = flags
    altered.coordinates = GlyphCoordinates(positions)
    altered.removeHinting()
    altered.recalcBounds(glyf)
    glyf[alternate] = altered
    advance, _ = font["hmtx"][original]
    font["hmtx"][alternate] = (round(advance + width * (spread - 1)), altered.xMin)


def main():
    font = TTFont(FONTS / "Kalam-Regular.ttf", recalcTimestamp=False)
    options = subset.Options()
    options.glyph_names = True
    options.hinting = False
    options.name_IDs = ["*"]
    latin = subset.Subsetter(options=options)
    latin.populate(unicodes=list(range(0x20, 0x250)) + list(range(0x2000, 0x2070)))
    latin.subset(font)
    cmap = font.getBestCmap()
    hands = [{} for _ in range(len(STROKES) + 1)]
    for letter in ascii_letters + digits + ".,?!-'’":
        name = cmap[ord(letter)]
        hands[0][letter] = name
        for style, stroke in enumerate(STROKES, 1):
            alternate = f"{name}.hand{style}"
            add_stroke(font, name, alternate, stroke)
            hands[style][letter] = alternate
    font.setGlyphOrder(font["glyf"].glyphOrder)

    features = ["languagesystem DFLT dflt;", "languagesystem latn dflt;"]
    steps = len(STROKES)
    for style, hand in enumerate(hands):
        features.append(f"@hand{style} = [{' '.join(hand.values())}];")
        for step in range(1, steps + 1):
            letters = [
                glyph for letter, glyph in hand.items()
                if (ord(letter) ^ (ord(letter) >> 2)) % steps == step - 1
            ]
            features.append(f"@step{style}_{step} = [{' '.join(letters)}];")

    features.append("feature calt {")
    # The preceding form and the current letter choose the next form, including across a space.
    for previous in range(len(hands)):
        for step in range(1, steps + 1):
            next_style = (previous + step) % len(hands)
            for gap in (" space", ""):
                features.append(f"sub @hand{previous}{gap} @step0_{step}' by @step{next_style}_{step};")
    features.append("} calt;")
    addOpenTypeFeaturesFromString(font, "\n".join(features), tables=["GSUB"])

    names = font["name"]
    for record in names.names[:]:
        if record.nameID == 7:
            names.names.remove(record)
        elif record.nameID in (1, 4, 16):
            record.string = "Folded Hand"
        elif record.nameID == 3:
            record.string = "FoldedHand-Regular 1.0"
        elif record.nameID == 5:
            record.string = "Version 1.0"
        elif record.nameID == 6:
            record.string = "FoldedHand-Regular"
    font["head"].fontRevision = 1.0
    font.flavor = "woff"
    font.save(FONTS / "FoldedHand-Regular.woff")


if __name__ == "__main__":
    main()
