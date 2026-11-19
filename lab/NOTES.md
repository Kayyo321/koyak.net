# Lab notes (seeds 12345, 7, 42 on the mascot)

- Pitch 6 / 5 levels (seed 7) is the only setting where both eyes and the mouth survive.
  Pitch ≥ 12 or levels ≤ 4 lose the face. Port: ~3.5 CSS px pitch at 1×, scaled by DPR.
- Highlights blow out because paper takes over too early. Port with smoothstep(0.4, 0.95).
- Shadow dropout (15% survivors below t=0.04) gives the night ground a sparse grain, keep it.
- Crops at 0.55× and 1.8× pitch read as "different proofs"; ±45° angle changes read as noise. Port only 0°/+23°.
- Misregistration 0.25 of pitch is the ceiling; above it the dot lattice stops reading as print.
