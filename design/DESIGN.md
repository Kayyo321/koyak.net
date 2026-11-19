# net — design plan

Working brief (assumed, change freely): **net** is a personal console for a small
crew of autonomous agents. One page, read at a glance: who is running, what they
are doing, what needs you, and how much the day has cost. The mascot is the face of
the crew and lives in the top-right corner.

## Tokens

| Name      | Hex       | Role |
|-----------|-----------|------|
| Night     | `#070936` | page ground — indigo, never black |
| Deep      | `#0E1150` | raised plates, rule lines at low alpha |
| Ultramarine | `#3B42D6` | the dot ink in mid-tones, chart columns |
| Lilac     | `#AEB2F2` | secondary text, idle states |
| Paper     | `#ECEEFF` | primary text, brightest dots |
| Sodium    | `#FFB86B` | used once: an agent that is waiting for you |

Type
- **Big Shoulders** (condensed, display) — headline sentence, agent names, figures.
- **IBM Plex Mono** (typewriter body) — running copy and row detail. The brief asks
  for the Nous-like printed-terminal voice; this is where it comes from.
- Sentence case everywhere. No all-caps eyebrows, no `→` on buttons, no `A · B` strings.

## Layout

```
+--------------------------------------------------------------+
| net                                    [  mascot plate      ]|
|                                        [  WebGL halftone    ]|
| Three agents are working.              [  bleeds off corner ]|
| One is waiting for you.                [                    ]|
|                                                              |
| ledger    reconciling October invoices        41 min   $0.62 |
| scout     reading supplier price pages        12 min   $0.18 |
| courier   drafted 3 replies — needs a yes      waiting  $0.04 |
| archivist indexing meeting notes               idle     —    |
|                                                              |
| last 24 hours  ▪▪▫▪▪▪▪▫▫▫▫▪▪ (dot columns)   spend   queue    |
+--------------------------------------------------------------+
```

Left-aligned text column on a 12-col grid; the mascot owns columns 8–12 of the top
band and is allowed to crop off the top and right edges like a print trimmed at the
bleed.

## Principles

1. **Halftone is the material.** Every image and every chart is made of print dots
   on night. Data columns are stacks of the same dots the mascot is made of.
2. **Spend boldness once.** The mascot plate is the only loud thing; it moves (cursor
   presses the dots, glitch slices drift). The rest is still, quiet text.
3. **Photobash with registration, not decoration.** The plate is a still composition
   (subject + fine technical engraving + offset crops), halftoned live in WebGL.
4. **The one moment:** on load the plate develops from coarse to fine dots, once.
   Reduced-motion skips straight to the developed frame.

## Review against the generic defaults

- First draft had a "big number + small label" KPI row across the top. Replaced with a
  plain-language headline sentence ("Three agents are working. One is waiting for
  you."), which says the same thing faster and is specific to this product.
- First draft used numbered `#1/#2` section markers borrowed from the reference.
  The sections are not a sequence, so they were cut.
- Near-black + single bright accent risk: ground is saturated indigo and the amber is
  a status (waiting), not decoration, used on one row only.
- Cards kit risk: no cards. Rows are separated by hairline rules at low alpha; the
  only framed object is the mascot plate.
