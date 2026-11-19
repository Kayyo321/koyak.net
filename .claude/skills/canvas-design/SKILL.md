---
name: canvas-design
description: Design original static art and fallback images for this website, including limited-palette dithered artwork.
license: Apache-2.0; see LICENSE.txt
---

# canvas-design

This is a documentation-only adaptation for koyak.net, not the original bundle. Based on [Anthropic's upstream skill](https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/canvas-design/SKILL.md). Copyright 2026 Anthropic, PBC. Adapted for this repository; upstream templates, helpers, and fonts are not included.

1. Define the subject, visual hierarchy, framing, crop, and palette before rendering. Match the requested visual direction without copying a reference's assets or identity.
2. Make the art and site layout separate: keep copy, controls, and navigation in semantic HTML. For a dithered still, quantize a grayscale source to the selected palette and preview several pixel scales.
3. Review at the intended desktop and mobile display sizes. Deliver a small static asset in the required format and crop, with a reduced-motion version where appropriate. Add alt text if the art conveys information.
4. Use original or authorized assets and already available fonts. This adaptation does not contain the upstream font pack or require font downloads.
