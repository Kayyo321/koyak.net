/* paper.js — the shared paper-and-pencil engine for koyak.net
   - injects the torn-paper and pencil SVG filters
   - generates hand-drawn scribble paths from a seed (same scribble every visit)
   - draws scribbles and moves paper pieces in step with scroll
   - "boils" edges a few times a second, like stop-motion paper */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <filter id="cut" x="-15%" y="-15%" width="135%" height="140%" color-interpolation-filters="sRGB">
      <feTurbulence class="boil" type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="1" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feDropShadow in="d" dx="1.2" dy="3" stdDeviation="2.4" flood-color="#1b1408" flood-opacity=".26"/>
    </filter>
    <filter id="cut-soft" x="-10%" y="-10%" width="125%" height="130%" color-interpolation-filters="sRGB">
      <feTurbulence class="boil" type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="1" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="pencil" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence class="boil" type="fractalNoise" baseFrequency="0.07" numOctaves="1" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs></svg>`);

  /* ---------- seeded scribble generators ---------- */
  const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f = (v) => v.toFixed(1);
  const smooth = (pts) => {
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`; }
    const l = pts[pts.length - 1]; return d + ` L${f(l[0])} ${f(l[1])}`;
  };
  const loop = (cx, cy, rx, ry, seed = 1, turns = 1.25) => { const r = rng(seed), n = 28, a0 = -2.3 + r(), pts = []; for (let k = 0; k <= n * turns; k++) { const a = a0 + (Math.PI * 2 * k) / n, s = 1 + (r() - .5) * .07 + k * .0025; pts.push([cx + rx * s * Math.cos(a), cy + ry * s * Math.sin(a)]); } return smooth(pts); };
  /** a hand-drawn loop with squared-off ends (superellipse), so long words stay clear of the line */
  const pill = (cx, cy, rx, ry, seed = 1, turns = 1.12, n = 5) => { const r = rng(seed), k = 36, a0 = -2.5 + r() * .5, pts = []; for (let i = 0; i <= k * turns; i++) { const a = a0 + (Math.PI * 2 * i) / k, c = Math.cos(a), sn = Math.sin(a), s = 1 + (r() - .5) * .04 + i * .0016; pts.push([cx + rx * s * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + ry * s * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)]); } return smooth(pts); };
  const scrawl = (x, y, w, seed = 2, passes = 2, wob = 3.2) => { const r = rng(seed), pts = [], n = Math.max(6, Math.round(w / 14)); for (let p = 0; p < passes; p++) for (let i = 0; i <= n; i++) { const k = p % 2 ? 1 - i / n : i / n; pts.push([x + w * k, y + p * 3 + (r() - .5) * wob]); } return smooth(pts); };
  const hatch = (x, y, w, h, gap = 8, seed = 3) => { const r = rng(seed), pts = []; for (let i = 0; i <= w; i += gap) { pts.push([x + i + (r() - .5) * 2, y + h], [x + i + gap * .6 + (r() - .5) * 2, y]); } return smooth(pts); };
  const vline = (x, y0, y1, seed = 9, wob = 5) => { const r = rng(seed), pts = [], step = y1 > y0 ? 22 : -22; for (let y = y0; step > 0 ? y <= y1 : y >= y1; y += step) pts.push([x + (r() - .5) * wob, y]); pts.push([x, y1]); return smooth(pts); };
  const hline = (y, x0, x1, seed = 9, wob = 5) => { const r = rng(seed), pts = []; for (let x = x0; x <= x1; x += 24) pts.push([x, y + (r() - .5) * wob]); pts.push([x1, y]); return smooth(pts); };
  const arrow = (x1, y1, x2, y2, bend = 30, head = 11) => { const mx = (x1 + x2) / 2 - bend * Math.sign(y2 - y1 || 1), my = (y1 + y2) / 2 + bend * Math.sign(x2 - x1 || 1) * .5; const a = Math.atan2(y2 - my, x2 - mx); return `M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)} M${f(x2 - head * Math.cos(a - .5))} ${f(y2 - head * Math.sin(a - .5))} L${f(x2)} ${f(y2)} L${f(x2 - head * Math.cos(a + .5))} ${f(y2 - head * Math.sin(a + .5))}`; };
  const check = (cx, cy, s) => `M${f(cx - s)} ${f(cy)} Q${f(cx - s * .5)} ${f(cy + s * .3)} ${f(cx - s * .2)} ${f(cy + s * .8)} Q${f(cx + s * .3)} ${f(cy - s * .4)} ${f(cx + s * 1.1)} ${f(cy - s * 1.1)}`;
  const box = (x, y, w, h, seed = 6, j = 5) => { const r = rng(seed), q = () => (r() - .5) * j; return `M${f(x + q())} ${f(y + q())} L${f(x + w + q())} ${f(y + q())} L${f(x + w + q())} ${f(y + h + q())} L${f(x + q())} ${f(y + h + q())} Z M${f(x + 8)} ${f(y - 2)} L${f(x + w * .55)} ${f(y + 2)}`; };
  const cross = (cx, cy, s, seed = 7) => { const r = rng(seed), q = () => (r() - .5) * 3; return `M${f(cx - s + q())} ${f(cy - s + q())} L${f(cx + s + q())} ${f(cy + s + q())} M${f(cx + s + q())} ${f(cy - s + q())} L${f(cx - s + q())} ${f(cy + s + q())}`; };

  /* ---------- scroll engine ---------- */
  const inks = [], hooks = [];
  let introT = reduce ? 1 : 0;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const local = (p, a, b) => clamp((p - a) / (b - a));
  const frameOf = (el) => el.closest('[data-scroll]') || document.documentElement;

  function progress(frame) {
    if (reduce) return 1;
    const vh = innerHeight;
    if (frame.dataset.scroll === 'intro') return introT;
    if (frame === document.documentElement) { const max = document.documentElement.scrollHeight - vh; return max > 0 ? clamp(scrollY / max) : 1; }
    const r = frame.getBoundingClientRect();
    if (frame.dataset.scroll === 'through') return clamp((vh * 0.85 - r.top) / Math.max(1, r.height));
    return clamp((vh * 0.92 - r.top) / (Math.min(r.height, vh) * 0.8));
  }

  /** draw a pencil path into an svg; it completes as its frame scrolls through [a, b] */
  function ink(svg, d, range = [0, 1], o = {}) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', 'ink ' + (o.className || ''));
    p.style.stroke = o.color || 'var(--ink)'; p.style.strokeWidth = o.width || 2;
    if (o.filter !== false) p.setAttribute('filter', 'url(#pencil)');
    if (o.fixed) p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (o.before) svg.insertBefore(p, o.before); else svg.appendChild(p);
    const len = p.getTotalLength() + 1;
    p.style.strokeDasharray = `${len} ${len}`;
    const item = { el: p, len, a: range[0], b: range[1], frame: o.frame || frameOf(svg), manual: !!o.manual, t: -1 };
    p.style.strokeDashoffset = reduce ? 0 : len;
    inks.push(item); return item;
  }
  function setInk(item, t) { if (item.t === t) return; item.t = t; item.el.style.strokeDashoffset = item.len * (1 - t); }
  /** call fn(progress) whenever the frame's scroll progress changes */
  function on(frame, fn) { hooks.push({ frame, fn, last: -1 }); }

  let pieces = [];
  const frameFor = (el) => (el.dataset.frame && document.querySelector(el.dataset.frame)) || frameOf(el);
  function collect() { pieces = [...document.querySelectorAll('[data-p]')].map((el) => { const [a, b] = el.dataset.p.split(',').map(Number); return { el, a, b, frame: frameFor(el), t: -1 }; }); }

  let queued = false;
  function update() {
    queued = false;
    const cache = new Map();
    const P = (fr) => { if (!cache.has(fr)) cache.set(fr, progress(fr)); return cache.get(fr); };
    for (const i of inks) if (!i.manual) setInk(i, local(P(i.frame), i.a, i.b));
    for (const p of pieces) { const t = Math.round(local(P(p.frame), p.a, p.b) * 1000) / 1000; if (t !== p.t) { p.t = t; p.el.style.setProperty('--t', t); } }
    for (const h of hooks) { const v = P(h.frame); if (v !== h.last) { h.last = v; h.fn(v); } }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);

  /* ---------- stop-motion boil ---------- */
  if (!reduce) {
    const nodes = document.querySelectorAll('feTurbulence.boil');
    let k = 0;
    setInterval(() => { if (document.hidden) return; k = (k + 1) % 3; nodes.forEach((n, i) => n.setAttribute('seed', 1 + i * 3 + k)); }, 140);
  }

  /* ---------- small shared behaviours ---------- */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const text = b.dataset.copy; const prev = b.textContent;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
    catch { const r = document.createRange(); const t = document.querySelector(b.dataset.copyTarget || 'body'); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Selected'; }
    setTimeout(() => { b.textContent = prev; }, 1600);
  });

  // pencil underline under the current page in the nav
  function navInk() {
    const cur = document.querySelector('.site-nav a[aria-current="page"]'); if (!cur) return;
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'nav-ink'); s.setAttribute('viewBox', '0 0 100 10'); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('aria-hidden', 'true');
    cur.appendChild(s);
    const it = ink(s, scrawl(2, 4, 96, cur.textContent.length * 7, 2, 2.5), [0, 1], { color: 'var(--signal)', width: 2, fixed: true, filter: false, manual: true });
    if (reduce) setInk(it, 1); else { const t0 = performance.now(); const step = (now) => { const t = Math.min(1, (now - t0 - 250) / 600); setInk(it, Math.max(0, 1 - Math.pow(1 - Math.max(t, 0), 3))); if (t < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  }

  window.Paper = { NS, reduce, rng, smooth, loop, pill, scrawl, hatch, vline, hline, arrow, check, box, cross, ink, setInk, on, local, clamp, progress,
    start() {
      navInk(); collect(); update();
      if (!reduce && document.querySelector('[data-scroll="intro"]')) {
        const t0 = performance.now() + 120, dur = 1700;
        const step = (now) => { const x = Math.max(0, Math.min(1, (now - t0) / dur)); introT = 1 - Math.pow(1 - x, 3); update(); if (x < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
      queue();
    },
    refresh() { collect(); queue(); },
    drop(items) { for (const it of items) { const i = inks.indexOf(it); if (i >= 0) inks.splice(i, 1); it.el.remove(); } } };
})();
