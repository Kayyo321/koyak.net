/* The typewriter. Every frame that moves is composed in 2D (sheet, machine, pressed keys, flying
   typebars), then printed by the same press as the girl at a finer screen so the keys keep their detail.
   Typed letters ride on top with their own ink: ribbon fibre, a little bleed, uneven pressure.
   Type on the keyboard or press the keys; Enter (or the lever) feeds a new line.
   The send button hands the machine to koyak.net: it glows pink, the girl's lips move, and the site types its
   answer back in purple ink, a key at a time, with a person's uneven hands and an even carriage return. */
(() => {
  const canvas = document.getElementById("writer-canvas");
  const sink = document.getElementById("writer-input");
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) { canvas.hidden = true; return; }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const clock = { now: () => performance.now() }; // one clock for everything, so tests can stop time mid-strike
  const HEAD = 180; // photo px of headroom above the machine for the sheet to rise into
  const FONT = '"Plex Mono", ui-monospace, monospace';
  const sound = () => window.koyakSound; // sound.js (may be missing, or muted)

  const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision highp float;
    uniform sampler2D uLum, uMask;
    uniform vec2 uRes;
    uniform float uPitch, uDevelop, uSeed, uInkPx, uMood, uDither;

    const vec3 NIGHT = vec3(0.027, 0.035, 0.212);
    const vec3 INK   = vec3(0.231, 0.259, 0.839);
    const vec3 PAPER = vec3(0.925, 0.933, 1.0);
    // koyak.net's turn: the machine prints in dark pink, and its own words come out in purple
    const vec3 INK_AI = vec3(0.55, 0.13, 0.47);
    const vec3 PAPER_AI = vec3(1.0, 0.86, 0.95);
    // the two hands sit far apart in hue: the visitor in navy-ultramarine, koyak.net in magenta-violet
    const vec3 NAVY = vec3(0.05, 0.08, 0.42);
    const vec3 PURPLE = vec3(0.43, 0.05, 0.5);
    const vec3 PURPLE_FRINGE = vec3(0.72, 0.28, 0.8);
    const float LEVELS = 7.0;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21) + uSeed * 0.137);
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

    // the black body is lifted a little so its form still prints as fine ink dots
    float tone(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      vec4 c = texture2D(uLum, uv);
      float l = c.a * (0.15 + 0.85 * pow(c.r, 1.1));
      return floor(l * (LEVELS - 1.0) + 0.5) / (LEVELS - 1.0);
    }

    vec2 screen(vec2 px, float pitch, float ang) {
      mat2 R = rot(ang), Ri = rot(-ang);
      vec2 q = R * (px - uRes * 0.5) / pitch;
      vec2 base = floor(q);
      float best = 0.0, bt = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = base + vec2(float(i), float(j)) + 0.5;
        vec2 c = cell + (vec2(hash(cell), hash(cell.yx + 7.0)) - 0.5) * 0.22;
        vec2 cuv = (Ri * (c * pitch) + uRes * 0.5) / uRes;
        float t = tone(cuv);
        if (t < 0.04) t = 0.0;
        float r = 0.5 * sqrt(t) * 1.42 * (0.94 + 0.12 * hash(cell + 3.0));
        float aa = 0.75 / pitch;
        float cov = 1.0 - smoothstep(r - aa, r + aa, length(q - c));
        if (t > 0.0 && cov > best) { best = cov; bt = t; }
      }
      return vec2(best, bt);
    }

    // ordered (Bayer 4x4) threshold: the type is printed as a dither, not a smooth fill
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

    float inkAt(vec2 uv) { return texture2D(uMask, uv).g; }
    float aiAt(vec2 uv) { return texture2D(uMask, uv).b; }

    void main() {
      vec2 px = gl_FragCoord.xy;
      vec2 uv = px / uRes;
      float dev = uDevelop * uDevelop * (3.0 - 2.0 * uDevelop);
      float pitch = mix(uPitch * 4.0, uPitch, dev);
      float paper = texture2D(uMask, uv).r;

      // the sheet takes a screen twice as fine, so type on it stays readable
      vec2 s = screen(px, paper > 0.5 ? pitch * 0.5 : pitch, radians(22.0));
      vec3 ink0 = mix(INK, INK_AI, uMood);
      vec3 dotc = mix(ink0, mix(PAPER, PAPER_AI, uMood * 0.8), smoothstep(0.4, 0.95, s.y));
      vec3 col = mix(NIGHT, dotc, s.x);
      float alpha = max(s.x, paper);

      // ink: ribbon fibre streaks, a soft bleed into the paper, and a blue fringe where the strike was light
      float m = inkAt(uv);
      vec2 o = vec2(uInkPx) / uRes;
      float bleed = (inkAt(uv + o * vec2(1.0, 0.0)) + inkAt(uv - o * vec2(1.0, 0.0)) +
                     inkAt(uv + o * vec2(0.0, 1.0)) + inkAt(uv - o * vec2(0.0, 1.0)) +
                     inkAt(uv + o * vec2(0.7, 0.7)) + inkAt(uv - o * vec2(0.7, 0.7))) / 6.0;
      vec2 fp = rot(0.35) * px / uInkPx;
      float fibre = 0.74 + 0.26 * vnoise(fp * vec2(0.35, 2.6)) * (0.6 + 0.4 * vnoise(fp * 0.9 + 17.0));
      float ink = clamp(m * fibre * 0.96 + bleed * 0.3 * dev, 0.0, 1.0) * dev;
      // which hand struck it: blue for the visitor, purple for koyak.net (the mask's blue channel)
      float aiB = aiAt(uv) + (aiAt(uv + o * vec2(1.0, 0.0)) + aiAt(uv - o * vec2(1.0, 0.0)) +
                              aiAt(uv + o * vec2(0.0, 1.0)) + aiAt(uv - o * vec2(0.0, 1.0))) * 0.25;
      float ai = clamp(aiB / max(m + bleed, 0.02), 0.0, 1.0);
      float b = (bayer4(px / uDither) + 0.5 / 16.0);
      float dith = step(b, ink);
      vec3 inkc = mix(INK * 0.85, NAVY, smoothstep(0.25, 0.8, m * fibre));
      vec3 aic = mix(PURPLE_FRINGE, PURPLE, smoothstep(0.25, 0.8, m * fibre));
      inkc = mix(inkc, aic, ai);
      // a second, offset threshold picks the lighter ribbon tone, so the dither has two inks in it
      inkc = mix(inkc, mix(INK, PURPLE_FRINGE, ai), step(ink, bayer4(px / uDither + 2.0)) * 0.4);
      col = mix(col, inkc, dith);
      alpha = max(alpha, dith);
      gl_FragColor = vec4(col, alpha);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.error(e); canvas.hidden = true; return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uLum", "uMask", "uRes", "uPitch", "uDevelop", "uSeed", "uInkPx", "uMood", "uDither"]) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uLum, 0); gl.uniform1i(U.uMask, 1); gl.uniform1f(U.uSeed, 11); gl.uniform1f(U.uMood, 0);

  function makeTex(unit) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const texLum = makeTex(0), texMask = makeTex(1);

  // 2D layers: lum = the scene in grey with alpha; mask = R the visible sheet, G the ink on it
  const lum = document.createElement("canvas"), mask = document.createElement("canvas");
  const lx = lum.getContext("2d"), mx = mask.getContext("2d");
  const shadow = document.createElement("canvas"); // the machine as a black silhouette, to occlude the sheet
  let M, machine, S = 1, SH = 0, SW = 0;
  const LUMK = 0.5; // the machine layer's resolution against the canvas

  /* ---------- the page: what has been typed ---------- */
  // glyph lines are counted from the line being typed (0, then -1, -2 ... above it), so nothing grows as you
  // keep going: each Enter shifts the sheet up one line and forgets whatever has left the top of the canvas.
  // line: lines fed so far (only a count); rise: how far the sheet's top edge has climbed, in lines, capped
  // ink: something was printed on the current line; blankAbove: the line above it was left empty
  const page = { line: 0, col: 0, glyphs: [], rise: 0, feedFrom: 0, feedT0: -1e9, jamT0: -1e9, ink: false, blankAbove: true };
  const anims = { keys: [], bars: [], space: -1e9, lever: -1e9 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const colW = () => (M.print.x1 - M.print.x0) / M.print.cols;
  const fontPx = () => colW() / 0.6;

  /* ---------- timing ---------- */
  const T = { press: 45, hold: 70, release: 150, up: 70, down: 170, feed: 260 };
  const ease = (t) => t * t * (3 - 2 * t);
  const outBack = (t) => { const c = 1.9; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  function keyDepth(age) {
    if (age < 0) return 0;
    if (age < T.press) return ease(age / T.press);
    if (age < T.hold) return 1;
    if (age < T.release) return 1 - ease((age - T.hold) / (T.release - T.hold));
    return 0;
  }
  function barLift(age) {
    if (age < 0) return 0;
    if (age < T.up) return ease(age / T.up);
    if (age < T.down) return 1 - ease((age - T.up) / (T.down - T.up));
    return 0;
  }

  /* ---------- composition ---------- */
  function paperTop() { return M.paper.top - page.rise * M.print.line - feedNow(); }
  // the feed animation's offset: -1 line the moment Enter lands, shooting past 0 and settling there
  function feedNow(now = clock.now()) {
    const k = Math.min(1, (now - page.feedT0) / T.feed);
    return k >= 1 ? 0 : page.feedFrom * (1 - outBack(k));
  }
  const keepLines = () => Math.ceil((M.print.y + HEAD + fontPx()) / M.print.line) + 1; // lines that can still be on the canvas
  function jamNow(now) {
    const age = now - page.jamT0;
    return age < 240 ? Math.sin(age / 240 * Math.PI * 5) * 5 * (1 - age / 240) : 0;
  }

  function drawSheet(ctx, now, fill) {
    const x = jamNow(now), top = paperTop();
    ctx.save();
    const vis = Math.max(top, -HEAD - 10);
    ctx.beginPath(); ctx.rect(M.paper.x0 + x, vis, M.paper.x1 - M.paper.x0, M.paper.feed - vis); ctx.clip();
    if (fill === "lum") {
      // a cream sheet, curving away into the platen at the bottom and shading at its top edge
      const g = ctx.createLinearGradient(0, M.paper.feed - 110, 0, M.paper.feed);
      g.addColorStop(0, "#e9e9e9"); g.addColorStop(0.6, "#c8c8c8"); g.addColorStop(1, "#7a7a7a");
      ctx.fillStyle = "#e9e9e9"; ctx.fillRect(M.paper.x0 + x, vis, M.paper.x1 - M.paper.x0, M.paper.feed - vis);
      ctx.fillStyle = g; ctx.fillRect(M.paper.x0 + x, M.paper.feed - 110, M.paper.x1 - M.paper.x0, 110);
      if (top > -HEAD - 10) { ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(M.paper.x0 + x, top, M.paper.x1 - M.paper.x0, 3); }
    } else {
      ctx.fillStyle = "#f00"; ctx.fillRect(M.paper.x0 + x, vis, M.paper.x1 - M.paper.x0, M.paper.feed - vis);
      ctx.globalCompositeOperation = "lighter";
      ctx.font = `${fontPx()}px ${FONT}`;
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
      for (const g of page.glyphs) {
        if (now < g.at) continue;
        const gx = M.print.x0 + (g.col + 0.5) * colW() + x;
        const gy = M.print.y + g.line * M.print.line - feedNow(now);
        if (gy < -HEAD - 60 || gy > M.paper.feed + 60) continue;
        ctx.fillStyle = g.ai ? "#0ff" : "#0f0"; // blue channel marks koyak.net's own words
        drawGlyph(ctx, g, gx, gy);
      }
    }
    ctx.restore();
  }

  // every strike is its own: a hair of rotation and drift, its own pressure, a heavier side, now and then a ghost
  function drawGlyph(ctx, g, x, y) {
    ctx.save();
    ctx.translate(x + g.dx, y + g.dy); ctx.rotate(g.rot); ctx.scale(g.sc, g.sc);
    ctx.globalAlpha = g.a * 0.8; ctx.fillText(g.ch, 0, 0);
    // a hair of extra weight, so the dithered strokes stay readable at small sizes
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = fontPx() * 0.05; ctx.lineJoin = "round"; ctx.strokeText(g.ch, 0, 0);
    const f = fontPx();
    ctx.beginPath();
    if (g.side === 0) ctx.rect(-f, -f, f, 2 * f); else if (g.side === 1) ctx.rect(0, -f, f, 2 * f);
    else if (g.side === 2) ctx.rect(-f, -f, 2 * f, f * 0.62); else ctx.rect(-f, -f * 0.38, 2 * f, f);
    ctx.clip();
    ctx.globalAlpha = g.a * 0.22; ctx.fillText(g.ch, 0, 0);
    ctx.restore();
    if (g.ghost) { ctx.save(); ctx.globalAlpha = 0.16; ctx.translate(x + g.dx + g.ghost[0], y + g.dy + g.ghost[1]); ctx.rotate(g.rot); ctx.fillText(g.ch, 0, 0); ctx.restore(); }
  }

  function drawKeys(ctx, now) {
    const r = M.keyR;
    for (const a of anims.keys) {
      const d = keyDepth(now - a.t0);
      if (d <= 0) continue;
      // the cap sinks into its well: smaller, lower, in shadow, with the well's rim showing above it
      const k = a.key, sc = 1 - 0.13 * d, dy = 7 * d;
      ctx.fillStyle = "#020202";
      ctx.beginPath(); ctx.arc(k.x, k.y, r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(150,150,150,${0.5 * d})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(k.x, k.y, r + 1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(k.x, k.y + dy, r * sc, 0, Math.PI * 2); ctx.clip();
      ctx.globalAlpha = 1 - 0.35 * d;
      ctx.drawImage(machine, k.x - r, k.y - r, 2 * r, 2 * r, k.x - r * sc, k.y - r * sc + dy, 2 * r * sc, 2 * r * sc);
      ctx.restore();
    }
    const sd = keyDepth(now - anims.space);
    if (sd > 0) {
      const s = M.space;
      ctx.fillStyle = "#040404"; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      ctx.globalAlpha = 1 - 0.2 * sd;
      ctx.drawImage(machine, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0, s.x0 + 3 * sd, s.y0 + 4 * sd, s.x1 - s.x0 - 6 * sd, s.y1 - s.y0 - 4 * sd);
      ctx.globalAlpha = 1;
    }
  }

  function barPath(a, now) {
    const u = barLift(now - a.t0);
    if (u <= 0) return null;
    const f = M.fan, t = a.angle * Math.PI / 180;
    const px = f.cx + f.pivot * Math.cos(t), py = f.cy + f.pivot * Math.sin(t);
    const rx = f.cx + f.rest * Math.cos(t), ry = f.cy + f.rest * Math.sin(t);
    const e = ease(u);
    return { px, py, tx: rx + (a.tx - rx) * e, ty: ry + (a.ty - ry) * e, u };
  }
  function drawBars(ctx, now, silhouette) {
    for (const a of anims.bars) {
      const b = barPath(a, now);
      if (!b) continue;
      const w = 7 * (1 + 0.7 * Math.sin(b.u * Math.PI / 2)); // nearer the lens at the top of its swing
      ctx.lineCap = "round";
      ctx.strokeStyle = silhouette ? "#000" : "#1a1a1a"; ctx.lineWidth = w + 4;
      ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.tx, b.ty); ctx.stroke();
      if (!silhouette) {
        ctx.strokeStyle = "#d8d8d8"; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.tx, b.ty); ctx.stroke();
      }
      ctx.save(); ctx.translate(b.tx, b.ty); ctx.rotate(Math.atan2(b.ty - b.py, b.tx - b.px));
      ctx.fillStyle = silhouette ? "#000" : "#f0f0f0"; ctx.fillRect(-8, -9 * (1 + 0.4 * b.u), 16, 18 * (1 + 0.4 * b.u));
      ctx.restore();
    }
  }

  function compose(now) {
    for (const [ctx, kind, k] of [[lx, "lum", LUMK], [mx, "mask", 1]]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (kind === "lum") ctx.clearRect(0, 0, SW, SH); else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SW, SH); }
      ctx.setTransform(S * k, 0, 0, S * k, 0, HEAD * S * k);
      drawSheet(ctx, now, kind);
      if (kind === "lum") {
        ctx.drawImage(machine, 0, 0);
        drawKeys(ctx, now);
        drawBars(ctx, now, false);
      } else {
        ctx.drawImage(shadow, 0, 0, M.size[0], M.size[1]);
        drawBars(ctx, now, true);
      }
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texLum);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lum);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
  }

  /* ---------- loop ---------- */
  const state = { develop: reduce.matches ? 1 : 0, t0: clock.now(), dirty: true };
  let raf = 0;
  // the machine's colour: 0 is the visitor's (ultramarine), 1 is koyak.net's turn (dark pink)
  const mood = { from: 0, to: 0, t0: -1e9, ms: 650 };
  const moodNow = (now) => { const k = Math.min(1, (now - mood.t0) / mood.ms); return mood.from + (mood.to - mood.from) * ease(k); };
  function setMood(to) { const now = clock.now(); mood.from = moodNow(now); mood.to = to; mood.t0 = reduce.matches ? -1e9 : now; kick(); }
  function busy(now) {
    return state.develop < 1 || now - mood.t0 < mood.ms || now - page.feedT0 < T.feed || now - page.jamT0 < 240 ||
      anims.keys.some((a) => now - a.t0 < T.release) || anims.bars.some((a) => now - a.t0 < T.down) ||
      now - anims.space < T.release || page.glyphs.some((g) => g.at > now - 20);
  }
  function frame() {
    raf = 0;
    const now = clock.now();
    if (state.develop < 1) state.develop = Math.min(1, (now - state.t0) / 1600);
    compose(now);
    gl.uniform1f(U.uDevelop, state.develop);
    gl.uniform1f(U.uMood, moodNow(now));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    anims.keys = anims.keys.filter((a) => now - a.t0 < T.release);
    anims.bars = anims.bars.filter((a) => now - a.t0 < T.down);
    if (busy(now)) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function resize() {
    if (!M) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    canvas.width = mask.width = SW = w;
    canvas.height = mask.height = SH = h;
    lum.width = Math.round(w * LUMK); lum.height = Math.round(h * LUMK);
    S = w / M.size[0];
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uPitch, Math.max(2.6, 2.1 * dpr));
    gl.uniform1f(U.uInkPx, Math.max(1, 0.55 * dpr));
    gl.uniform1f(U.uDither, Math.max(1, Math.round(dpr))); // one dither cell per CSS pixel
    kick();
  }

  /* ---------- typing ---------- */
  const keyByLabel = {};
  function keyFor(ch) {
    const c = ch.toUpperCase();
    if (keyByLabel[c]) return keyByLabel[c];
    const alias = { "+": "=", "-": "=", "_": "=", ":": ";", "'": ";", '"': ";", "<": ",", "!": ".", "?": ".", ">": ".", "/": "." }[c];
    if (alias) return keyByLabel[alias];
    let h = 0; for (const x of ch) h = (h * 31 + x.codePointAt(0)) >>> 0;
    return M.keys[h % M.keys.length];
  }
  function barAngle(key) {
    // keys map onto the fan left to right, rows interleaved, so neighbours never share a bar
    const xs = M.keys.map((k) => k.x), lo = Math.min(...xs), hi = Math.max(...xs);
    const row = Math.round((key.y - M.keys[0].y) / 72);
    const f = M.fan, span = f.a1 - f.a0;
    return f.a1 - ((key.x - lo) / (hi - lo)) * span * 0.94 - row * 0.9;
  }

  function type(ch, ai = false) {
    if (!M) return;
    const now = clock.now(), key = keyFor(ch);
    anims.keys.push({ key, t0: now });
    if (page.col >= M.print.cols) { page.jamT0 = now; sound()?.jam(); kick(); return; } // at the margin: the keys go down, nothing prints
    sound()?.key({ delay: reduce.matches ? 0 : T.up, gain: ai ? 0.75 : 1 }); // heard as the slug meets the paper
    const col = page.col++;
    page.ink = true;
    if (!ai) { draft.lines[draft.lines.length - 1][col] = ch; draftChanged(); }
    const g = {
      ch, ai, line: 0, col, at: reduce.matches ? 0 : now + T.up,
      rot: rand(-0.03, 0.03), dx: rand(-1.1, 1.1), dy: rand(-1.3, 1.3), sc: rand(0.985, 1.02),
      a: rand(0.8, 1), side: Math.floor(Math.random() * 4),
      ghost: Math.random() < 0.12 ? [rand(-1.2, 1.2), rand(-0.8, 0.8)] : null,
    };
    page.glyphs.push(g);
    if (!reduce.matches) anims.bars.push({ t0: now, angle: barAngle(key), tx: M.print.x0 + (col + 0.5) * colW(), ty: M.print.y - fontPx() * 0.32 });
    describe(); kick();
  }
  function space() {
    if (!M) return;
    anims.space = clock.now();
    if (page.col < M.print.cols) { page.col++; sound()?.space({ gain: turn === "you" ? 1 : 0.75 }); }
    else { page.jamT0 = clock.now(); sound()?.jam(); }
    kick();
  }
  function back() { if (M && page.col > 0) { page.col--; kick(); } }
  function ret() {
    if (!M) return;
    const now = clock.now();
    sound()?.carriage({ col: page.col, cols: M.print.cols });
    // shift every line up one; the offset starts a line low so nothing jumps, then the sheet shoots up to it
    page.feedFrom = feedNow(now) - M.print.line; page.feedT0 = reduce.matches ? -1e9 : now;
    page.line++; page.col = 0;
    page.blankAbove = !page.ink; page.ink = false; // was the line just left empty? (keeps exactly one blank line between turns)
    if (turn === "you") { draft.lines.push([]); draftChanged(); }
    const keep = keepLines();
    if (page.rise < keep) page.rise++; // past this the top edge is off the canvas for good; stop counting
    for (const g of page.glyphs) g.line--;
    page.glyphs = page.glyphs.filter((g) => g.line >= -keep); // off the top of the canvas: forgotten
    anims.lever = now;
    describe(); kick();
  }

  let describeTimer = 0;
  function describe() {
    clearTimeout(describeTimer);
    describeTimer = setTimeout(() => {
      const lines = new Map();
      for (const g of page.glyphs) { if (!lines.has(g.line)) lines.set(g.line, []); lines.get(g.line)[g.col] = g.ch; }
      const text = [...lines.keys()].sort((a, b) => a - b)
        .map((n) => Array.from(lines.get(n), (c) => c || " ").join("").trimEnd()).join(" / ");
      canvas.setAttribute("aria-label", "A typewriter. " + (text ? "The sheet reads: " + text : "The sheet is blank. Type to write on it."));
      canvas.dataset.typed = text;
    }, 120);
  }

  function handleKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { send(); return true; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return false;
    if (turn !== "you") return e.key.length === 1 || e.key === "Enter" || e.key === "Backspace"; // koyak.net has the keys
    if (e.key === "Enter") ret();
    else if (e.key === "Backspace") back();
    else if (e.key === " ") space();
    else if (e.key.length === 1 || [...e.key].length === 1) type(e.key);
    else return false;
    return true;
  }
  window.addEventListener("keydown", (e) => {
    if (e.target !== sink && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    // Enter / Space on a focused card must activate it, not feed the typewriter
    if ((e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".cards, .send, .mute")) return;
    if (e.repeat) { if (e.key.length === 1 || e.key === "Enter" || e.key === " ") e.preventDefault(); return; }
    if (handleKey(e)) e.preventDefault();
  });
  // phones: the soft keyboard reports through input events rather than keydown
  sink.addEventListener("beforeinput", (e) => {
    e.preventDefault();
    if (turn !== "you") return;
    if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") ret();
    else if (e.inputType === "deleteContentBackward") back();
    else if (e.data) for (const ch of e.data) ch === " " ? space() : type(ch);
  });

  // pressing the machine itself
  function hit(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * M.size[0];
    const y = (e.clientY - r.top) / r.height * (M.size[1] + HEAD) - HEAD;
    for (const k of M.keys) if (Math.hypot(x - k.x, y - k.y) < M.keyR + 4) return { key: k };
    const s = M.space; if (x > s.x0 && x < s.x1 && y > s.y0 - 6 && y < s.y1 + 6) return { space: true };
    const l = M.lever; if (x > l.x0 && x < l.x1 && y > l.y0 && y < l.y1) return { lever: true };
    if (x > M.paper.x0 && x < M.paper.x1 && y > paperTop() && y < M.paper.feed) return { paper: true };
    return null;
  }
  canvas.addEventListener("pointermove", (e) => { if (M && turn !== "you") { canvas.style.cursor = "wait"; return; } if (M) { const h = hit(e); canvas.style.cursor = h && !h.paper ? "pointer" : h ? "text" : "default"; } });
  canvas.addEventListener("pointerdown", (e) => {
    if (!M || turn !== "you") return;
    const h = hit(e);
    if (!h) return;
    if (h.key) { const k = h.key.k; type(/[A-Z]/.test(k) && !e.shiftKey ? k.toLowerCase() : k); }
    else if (h.space) space();
    else if (h.lever) ret();
    if (e.pointerType !== "mouse") sink.focus({ preventScroll: true }); // bring up the soft keyboard
    e.preventDefault();
  });

  /* ---------- talking to koyak.net ---------- */
  // what the visitor has typed since their last send, kept apart from the page (which forgets lines off the top)
  const draft = { lines: [[]] };
  const history = []; // { role, content }, the conversation so far (the Worker keeps only the latest few)
  let turn = "you";    // "you" | "ai": while it is koyak.net's turn, nothing the visitor does reaches the machine
  const sendBtn = document.getElementById("writer-send");
  const live = document.getElementById("writer-status");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function draftText() {
    // the carriage is only 24 wide, so line breaks are just returns: join them; an empty line is a paragraph
    const lines = draft.lines.map((l) => Array.from(l, (c) => c || " ").join("").trim());
    return lines.reduce((acc, l) => (l ? acc + (acc && !acc.endsWith("\n") ? " " : "") + l : acc && !acc.endsWith("\n\n") ? acc + "\n\n" : acc), "").trim();
  }
  function draftChanged() {
    if (!sendBtn) return;
    const empty = !draftText();
    sendBtn.disabled = turn !== "you" || empty;
    sendBtn.classList.toggle("is-empty", turn === "you" && empty); // the plane waits at half strength
  }

  // a carriage return made by the hands at the keys: a beat at the margin, the lever, a beat to find the keys again
  async function carriage() {
    await wait(reduce.matches ? 60 : 300);
    ret();
    await wait(reduce.matches ? 80 : 460);
  }
  // end the line in use (if any) and leave exactly one blank line before the next speaker
  async function gap() {
    if (page.col > 0 || page.ink) await carriage();
    if (!page.blankAbove) await carriage();
  }

  // the model's text, made printable on this machine and broken at words into 24-column lines ("" = blank line)
  function layout(text) {
    const clean = text.normalize("NFKC")
      .replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, "-").replace(/\u2026/g, "...").replace(/[*_#`]/g, "")
      .replace(/[^\x20-\x7E\n]/g, "").replace(/\r/g, "");
    const cols = M.print.cols, out = [];
    for (const para of clean.split(/\n\s*\n+/)) {
      if (out.length) out.push("");
      for (const raw of para.split("\n")) {
        let line = "";
        for (let word of raw.split(/\s+/).filter(Boolean)) {
          while (word.length > cols) { if (line) { out.push(line); line = ""; } out.push(word.slice(0, cols)); word = word.slice(cols); }
          if (!word) continue;
          if (line && line.length + 1 + word.length > cols) { out.push(line); line = word; }
          else line = line ? line + " " + word : word;
        }
        if (line) out.push(line);
      }
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }

  // a person's hands: no two keystrokes the same distance apart, a breath after words, longer after a sentence
  function keyDelay(prev, ch) {
    if (reduce.matches) return 18;
    let d = 55 + Math.pow(Math.random(), 1.8) * 190;
    if (prev === " ") d += Math.random() < 0.35 ? 60 + Math.random() * 160 : 0;     // finding the next word
    if (/[.!?]/.test(prev)) d += 260 + Math.random() * 380;                          // end of a thought
    else if (/[,;:]/.test(prev)) d += 120 + Math.random() * 200;
    if (prev && prev === ch) d *= 0.7;                                                // a doubled letter comes quick
    if (Math.random() < 0.04) d += 250 + Math.random() * 500;                         // a hesitation
    return d;
  }

  const talk = (talking) => window.dispatchEvent(new CustomEvent("koyak:talk", { detail: { talking } }));
  async function typeOut(text) {
    const lines = layout(text);
    // her voice rises toward the end of a question: for each letter, is the sentence it belongs to one?
    const flat = lines.join(" ");
    let pos = 0;
    const asking = (i) => { const m = /[.!?]/.exec(flat.slice(i)); return !!m && m[0] === "?" && m.index < 14; };
    talk(true);
    let prev = "";
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) { talk(false); await carriage(); talk(true); prev = ""; pos++; }
      for (const ch of lines[i]) {
        await wait(keyDelay(prev, ch));
        sound()?.say(ch, { question: asking(pos) }); // the syllable her mouth makes next (plate.js voices it)
        if (ch === " ") space(); else type(ch, true);
        prev = ch; pos++;
      }
    }
    await wait(reduce.matches ? 0 : T.down);
    talk(false);
  }

  function setTurn(t) {
    turn = t;
    canvas.dataset.turn = t;
    setMood(t === "you" ? 0 : 1);
    window.dispatchEvent(new CustomEvent("koyak:turn", { detail: { turn: t } })); // plane.js throws / rebuilds the airplane
    if (t !== "you") { anims.keys = []; canvas.style.cursor = "wait"; } else canvas.style.cursor = "";
    draftChanged();
  }

  const SILENCE = {
    "no-key": "i'm here. i just can't find my voice yet.",
    rate: "slow down. my keys are still warm. try me again in a minute.",
    other: "the line went quiet for a second. say that again?",
  };
  async function ask() {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch("api/chat", {
        method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
        body: JSON.stringify({ messages: history.slice(-16) }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.reply) return { reply: data.reply };
      return { reply: SILENCE[data.error] || SILENCE.other, failed: true };
    } catch (_) {
      return { reply: SILENCE.other, failed: true };
    } finally { clearTimeout(timer); }
  }

  async function send() {
    if (!M || turn !== "you") return;
    const text = draftText();
    if (!text) { page.jamT0 = clock.now(); kick(); return; }
    setTurn("ai");
    if (live) live.textContent = "koyak.net is typing";
    history.push({ role: "user", content: text });
    draft.lines = [[]];
    const answer = ask();            // the request and the carriage returns happen together
    await gap();
    const { reply, failed } = await answer;
    if (!failed) history.push({ role: "assistant", content: reply });
    await typeOut(reply);
    await gap();
    draft.lines = [[]];
    setTurn("you");
    if (live) live.textContent = "koyak.net wrote: " + reply;
    describe();
  }
  if (sendBtn) {
    sendBtn.addEventListener("click", () => send());
    draftChanged();
  }

  /* ---------- load ---------- */
  Promise.all([
    fetch("assets/typewriter.json").then((r) => r.json()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "assets/typewriter.png"; }),
    document.fonts.load(`400 40px "Plex Mono"`),
  ]).then(([meta, img]) => {
    M = meta; machine = img;
    for (const k of M.keys) keyByLabel[k.k] = k;
    shadow.width = img.width; shadow.height = img.height;
    const sx = shadow.getContext("2d");
    sx.drawImage(img, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = "#000"; sx.fillRect(0, 0, img.width, img.height);
    resize(); describe();
    state.t0 = clock.now(); canvas.dataset.ready = "1"; kick();
    new ResizeObserver(resize).observe(canvas);
    reduce.addEventListener("change", () => { state.develop = 1; kick(); });
  }).catch((e) => console.error(e));

  window.__typewriter = { page, type, space, back, ret, T, clock, render: () => frame(), send, draftText, history, layout, get turn() { return turn; } }; // for the tests (T: timings)
})();
