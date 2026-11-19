---
name: algorithmic-art
description: Create original seeded, procedural raster graphics, especially ordered dithering for this site's decorative artwork.
license: Apache-2.0; see LICENSE.txt
---

# algorithmic-art

This is a documentation-only adaptation for koyak.net, not the original bundle. Based on [Anthropic's upstream skill](https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/algorithmic-art/SKILL.md). Copyright 2026 Anthropic, PBC. Adapted for this repository; upstream templates, helpers, and fonts are not included.

1. Start with a small canvas and an original subject or scalar field. Make seed, palette, and density adjustable; keep a fixed seed for reproducible previews.
2. Quantize luminance against a repeating 4×4 or 8×8 Bayer threshold matrix, then map the result to the approved palette. Draw at an intentional pixel size and scale without smoothing. Compare levels and pixel sizes visually; don't use random grain as a substitute.
3. Prefer a pre-rendered still or first-party Canvas 2D for motion. Keep art behind or beside readable HTML, not baked into UI text. Pause loops when offscreen, respect reduced motion, and provide a still fallback if scripting is absent.
4. Keep prototypes local. Don't pull in upstream viewer templates, hosted scripts, or new runtime libraries as part of applying this skill.
