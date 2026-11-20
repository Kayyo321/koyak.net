/* Night Press, ported from lab/night-press.html to WebGL.
   Halftones the mascot plate live: rotated AM screen, posterized tone, seeded
   misregistration, offset crops re-pressed at another pitch, and a loupe under the cursor: a spinning
   shape (circle, triangle, square, star, heart, circle...) that lifts the screen off whatever is under it.
   One develop moment on load. */
(() => {
  const canvas = document.getElementById("plate-canvas");
  const fallback = document.querySelector(".plate-fallback");
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  const useFallback = () => { canvas.hidden = true; fallback.hidden = false; };
  if (!gl) return useFallback();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const SEED = 7; // lab seed where both eyes and the mouth survive
  const RIP = window.koyakRipples; // ripple.js: the title's ripples reach this far, faintly
  const RIP_STUB = "vec3 ripple(vec2 p, float r) { return vec3(0.0); } vec2 ripClient(vec2 p) { return p; }";

  const vert = `
    attribute vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const frag = `
    precision highp float;
    uniform sampler2D uSubject, uSubjectB, uTech;
    uniform float uMix, uDim;
    uniform vec2 uRes;
    uniform float uPitch, uTime, uDevelop, uMotion, uSeed;
    uniform vec2 uMouse;
    uniform float uLens;
    uniform vec4 uCrop[6];
    uniform vec4 uCropP[6];
    ${RIP ? RIP.glsl : RIP_STUB}

    const vec3 NIGHT = vec3(0.027, 0.035, 0.212);
    const vec3 INK   = vec3(0.231, 0.259, 0.839);
    const vec3 PAPER = vec3(0.925, 0.933, 1.0);
    const float LEVELS = 6.0;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21) + uSeed * 0.137);
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

    // frame changes dissolve dot by dot: each cell flips to the next frame at its own seeded moment
    float tone(vec2 uv, vec2 cell) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      float l = (uMix > 0.0 && hash(cell + 51.0) < uMix) ? texture2D(uSubjectB, uv).r : texture2D(uSubject, uv).r;
      l *= uDim;
      l = pow(l, 1.15);
      return floor(l * (LEVELS - 1.0) + 0.5) / (LEVELS - 1.0);
    }

    // returns (coverage, tone) of the dot screen at device pixel px
    vec2 screen(vec2 px, float pitch, float ang, vec2 shift, float salt) {
      mat2 R = rot(ang), Ri = rot(-ang);
      vec2 q = R * (px - uRes * 0.5) / pitch;
      vec2 base = floor(q);
      float best = 0.0, bt = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = base + vec2(float(i), float(j)) + 0.5;
        vec2 c = cell + (vec2(hash(cell + salt), hash(cell.yx + salt + 7.0)) - 0.5) * 0.25;
        vec2 cuv = (Ri * (c * pitch) + uRes * 0.5) / uRes + shift;
        float t = tone(cuv, cell);
        if (t < 0.04 && hash(cell + salt + 99.0) < 0.85) t = 0.0;
        float r = 0.5 * sqrt(t) * 1.42 * (0.92 + 0.16 * hash(cell + salt + 3.0));
        float aa = 0.75 / pitch;
        float cov = 1.0 - smoothstep(r - aa, r + aa, length(q - c));
        if (t > 0.0 && cov > best) { best = cov; bt = t; }
      }
      return vec2(best, bt);
    }

    /* ---------- the loupe's shapes (signed distances, after Inigo Quilez) ---------- */
    float dot2(vec2 v) { return dot(v, v); }
    float sdTri(vec2 p, float r) {
      const float k = 1.7320508;
      p.x = abs(p.x) - r; p.y = p.y + r / k;
      if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
      p.x -= clamp(p.x, -2.0 * r, 0.0);
      return -length(p) * sign(p.y);
    }
    float sdBox(vec2 p, float b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
    float sdStar(vec2 p, float r, float rf) {
      const vec2 k1 = vec2(0.809016994375, -0.587785252292);
      const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
      p.x = abs(p.x);
      p -= 2.0 * max(dot(k1, p), 0.0) * k1;
      p -= 2.0 * max(dot(k2, p), 0.0) * k2;
      p.x = abs(p.x);
      p.y -= r;
      vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
      float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
      return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
    }
    float sdHeart(vec2 p) {
      p.x = abs(p.x);
      if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
      return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
    }
    // 0 circle, 1 triangle, 2 square, 3 star, 4 heart; R is the circle's radius, the rest are sized to match it
    float shape(int i, vec2 p, float R) {
      if (i == 0) return length(p) - R;
      if (i == 1) return sdTri(p, R * 1.05);
      if (i == 2) return sdBox(p, R * 0.84);
      if (i == 3) return sdStar(p, R * 1.18, 0.45);
      float s = R * 1.6;
      return sdHeart(p / s + vec2(0.0, 0.52)) * s;
    }
    vec3 rawTone(vec2 uv) { // the plate with no screen at all, in the press's three inks
      float l = mix(texture2D(uSubject, uv).r, texture2D(uSubjectB, uv).r, uMix) * uDim;
      l = pow(l, 1.15);
      return l < 0.5 ? mix(NIGHT, INK, l * 2.0) : mix(INK, PAPER, l * 2.0 - 1.0);
    }

    void main() {
      vec2 px = gl_FragCoord.xy;
      // a ripple from the title, nearly spent by the time it gets here, bends the print a little as it passes
      vec3 rw = ripple(ripClient(px), 380.0);
      px += vec2(rw.y, -rw.z) * 9.0 * uPitch / 3.0;
      vec2 uv = px / uRes;
      float dev = uDevelop * uDevelop * (3.0 - 2.0 * uDevelop);
      float pitch = mix(uPitch * 4.0, uPitch, dev);
      float ang = radians(22.0);

      vec2 s = screen(px, pitch, ang, vec2(0.0), 0.0);
      float frame = 0.0;

      // offset crops: re-pressed proofs that were never quite aligned
      for (int k = 0; k < 6; k++) {
        vec4 r = uCrop[k];
        if (uv.x > r.x && uv.y > r.y && uv.x < r.x + r.z && uv.y < r.y + r.w) {
          vec4 p = uCropP[k];
          vec2 drift = vec2(sin(uTime * 0.21 + float(k) * 1.7), 0.0) * 0.006 * uMotion;
          s = screen(px, pitch * p.x, ang + radians(p.y), p.zw + drift, float(k) + 11.0);
          vec2 e = min(uv - r.xy, r.xy + r.zw - uv) * uRes;
          frame = max(frame, 1.0 - smoothstep(0.0, 1.2, min(e.x, e.y)));
        }
      }

      vec3 dotc = mix(INK, PAPER, smoothstep(0.4, 0.95, s.y));
      vec3 col = mix(NIGHT, dotc, s.x);
      col = mix(col, PAPER, frame * 0.22);

      // loupe: a spinning shape that morphs circle > triangle > square > star > heart > circle and lifts the
      // screen off what is under it. Arriving, it whirls in from a point with an overshoot, its edge draws
      // itself round like a clock hand, and the inside un-prints cell by cell; leaving, all of it runs backwards.
      if (uLens > 0.0) {
        float e = clamp(uLens, 0.0, 1.0), b = e - 1.0;
        float pop = max(1.0 + 2.70158 * b * b * b + 1.70158 * b * b, 0.0);
        float R = max(0.088 * pop, 1e-4);
        float spin = uTime * 0.9 * uMotion + (1.0 - e) * 5.0;
        vec2 p = rot(spin) * (uv - uMouse);
        float seg = uTime / 1.7 * uMotion;
        int i0 = int(mod(floor(seg), 5.0)), i1 = int(mod(floor(seg) + 1.0, 5.0));
        float d = mix(shape(i0, p, R), shape(i1, p, R), smoothstep(0.55, 1.0, fract(seg)));
        float aa = 1.2 / uRes.x;
        float inside = 1.0 - smoothstep(-aa, aa, d);
        vec2 cq = floor(rot(ang) * (px - uRes * 0.5) / pitch);
        float reveal = step(hash(cq + 77.0), smoothstep(0.1, 0.9, e));
        col = mix(col, rawTone(uv), inside * reveal);
        // the edge, printed as a ring of fine paper dots
        float band = 1.0 - smoothstep(0.0045 - aa, 0.0045 + aa, abs(d));
        vec2 g = fract(px / (pitch * 0.55)) - 0.5;
        float dotm = 1.0 - smoothstep(0.26, 0.38, length(g));
        float wipe = step(atan(p.y, p.x) / 6.2831853 + 0.5, smoothstep(0.0, 0.75, e));
        col = mix(col, PAPER, band * dotm * wipe * 0.92);
      }

      // hairline technical layer, a breath of parallax against the subject
      vec2 par = (uMouse - 0.5) * 0.006 * uLens;
      float tech = texture2D(uTech, uv - par).a * smoothstep(0.35, 1.0, dev);
      col = mix(col, PAPER, tech * 0.62);

      gl_FragColor = vec4(col, 1.0);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.error(e); return useFallback(); }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  for (const n of ["uSubject", "uSubjectB", "uMix", "uDim", "uTech", "uRes", "uPitch", "uTime", "uDevelop", "uMotion", "uSeed", "uMouse", "uLens", "uCrop", "uCropP"])
    U[n] = gl.getUniformLocation(prog, n);

  // seeded crops (mulberry32), placed over the figure, in GL uv (y up)
  function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rand = rng(SEED * 9973);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  // the face (both eyes down to both mouths) stays clear: a shifted crop through an eye prints it twice
  const FACE = [0.28, 0.36, 0.68, 0.64]; // x0, y0, x1, y1 in GL uv
  const hitsFace = (x, y, w, h) => x < FACE[2] && x + w > FACE[0] && y < FACE[3] && y + h > FACE[1];
  const crops = [], cropP = [];
  for (let k = 0; k < 6; k++) {
    let w, h, x, y, tries = 0;
    do {
      w = 0.05 + rand() * 0.2; h = 0.02 + rand() * 0.15;
      x = 0.16 + rand() * (0.68 - w); y = 0.16 + rand() * (0.66 - h);
    } while (hitsFace(x, y, w, h) && ++tries < 200);
    crops.push(x, y, w, h);
    cropP.push(pick([0.55, 1.8, 1.4]), pick([0, 23]), (rand() * 2 - 1) * 0.02, (rand() * 2 - 1) * 0.006);
  }
  gl.uniform4fv(U.uCrop, crops);
  gl.uniform4fv(U.uCropP, cropP);
  gl.uniform1f(U.uSeed, SEED);
  const feedRipples = RIP ? RIP.bind(gl, prog, canvas) : () => {};

  function texture(unit, url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const t = gl.createTexture();
        t.url = url;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        res(t);
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  const state = { develop: reduce.matches ? 1 : 0, mouse: [0.5, 0.5], lens: 0, lensTarget: 0, visible: true, t0: performance.now() };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    // ~190 cells across the plate at any size, never finer than 3 device px
    gl.uniform1f(U.uPitch, Math.max(3 * dpr, w / 190));
  }

  function draw(now) {
    gl.uniform1f(U.uTime, (now - state.t0) / 1000);
    gl.uniform1f(U.uDevelop, state.develop);
    gl.uniform1f(U.uMotion, reduce.matches ? 0 : 1);
    gl.uniform2f(U.uMouse, state.mouse[0], state.mouse[1]);
    gl.uniform1f(U.uLens, state.lens);
    gl.uniform1f(U.uMix, face.mix);
    gl.uniform1f(U.uDim, face.dim);
    feedRipples(now);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    const animatingIn = state.develop < 1;
    if (animatingIn) state.develop = Math.min(1, (now - state.t0) / 1600);
    // the loupe arrives in ~0.55 s and leaves in ~0.42 s (the shader shapes both from this one number)
    const dt = Math.min(64, now - (state.last || now)); state.last = now;
    if (reduce.matches) state.lens = state.lensTarget;
    else if (state.lens < state.lensTarget) state.lens = Math.min(state.lensTarget, state.lens + dt / 550);
    else if (state.lens > state.lensTarget) state.lens = Math.max(state.lensTarget, state.lens - dt / 420);
    draw(now);
    const drifting = !reduce.matches && state.visible;
    const busy = animatingIn || (RIP && RIP.active(now)) || state.lens !== state.lensTarget || (state.lens > 0 && !reduce.matches) || face.tweening;
    if (busy) raf = requestAnimationFrame(frame);
    else if (drifting) { // the slow drift only needs ~20 fps
      clearTimeout(last); last = setTimeout(() => { if (!raf) raf = requestAnimationFrame(frame); }, 50);
    }
  }
  const kick = () => { if (!raf && state.visible) raf = requestAnimationFrame(frame); };

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    state.mouse = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    state.lensTarget = e.pointerType === "touch" ? 0 : 1;
    kick();
  });
  canvas.addEventListener("pointerleave", () => { state.lensTarget = 0; kick(); });
  window.addEventListener("koyak:ripple", kick);
  new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; kick(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => { state.visible = !document.hidden; kick(); });
  reduce.addEventListener("change", () => { state.develop = 1; kick(); });
  new ResizeObserver(() => { resize(); kick(); }).observe(canvas);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); useFallback(); });

  /* ---------- the face: random blinks, and sleep after 15 s without you ---------- */
  const IDLE_MS = (Number(new URLSearchParams(location.search).get("idle")) || 15) * 1000;
  // gen: every scene change (falling asleep while away, waking) bumps it, and any blink or fade
  // still in flight from before sees the change and stops instead of cutting back to an old frame
  const face = { tex: {}, from: "open", to: "open", mix: 0, dim: 1, tweening: false, mode: "awake", busy: false, gen: 0 };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => t * t * (3 - 2 * t);

  function bind(from, to, mix) {
    face.from = from; face.to = to; face.mix = mix;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, face.tex[from]);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, face.tex[to]);
    kick();
  }
  const cut = (name) => bind(name, name, 0);
  // crossfade the tone plates (and the exposure) over ms; reduced motion, or a hidden page, cuts straight to the end
  function fade(to, ms, dim = face.dim) {
    if (!face.tex[to]) return Promise.resolve();
    if (reduce.matches || ms <= 0 || document.hidden) { face.dim = dim; cut(to); return Promise.resolve(); }
    const from = face.from, d0 = face.dim, t0 = performance.now(), gen = face.gen;
    face.tweening = true;
    return new Promise((done) => {
      const step = (now) => {
        if (gen !== face.gen) { done(); return; }
        const k = Math.min(1, (now - t0) / ms), e = ease(k);
        face.dim = d0 + (dim - d0) * e;
        bind(from, to, e);
        if (k < 1) requestAnimationFrame(step);
        else { face.tweening = false; cut(to); done(); }
      };
      requestAnimationFrame(step);
    });
  }
  const setMode = (m) => { face.mode = m; canvas.dataset.face = m; };

  async function blink(twice = false) {
    if (face.mode !== "awake" || face.busy || reduce.matches || document.hidden || !face.tex["blink-closed"]) return;
    const gen = face.gen;
    face.busy = true; setMode("blinking");
    const show = async (name, ms) => { if (gen === face.gen) cut(name); if (ms) await wait(ms); };
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      await show("blink-half", 55); await show("blink-closed", 90); await show("blink-half", 55);
      await show("open", twice && i === 0 ? 140 : 0);
    }
    if (gen !== face.gen) return; // she fell asleep mid-blink; that scene owns the face now
    face.busy = false;
    if (face.mode === "blinking") setMode("awake");
  }
  let blinkTimer = 0;
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => { blink(Math.random() < 0.18); scheduleBlink(); }, 2500 + Math.random() * 4500);
  }

  async function sleep() {
    if (face.talking) return;
    if (face.mode === "asleep" || face.mode === "falling" || !face.tex.sleep) return;
    while (face.busy) await wait(20);
    const gen = face.gen;
    face.busy = true; setMode("falling");
    await fade("sleep-half", 700, 0.92);
    if (gen === face.gen) await wait(260);
    if (gen === face.gen) await fade("sleep", 1100, 0.8);
    if (gen !== face.gen) return;
    face.busy = false; setMode("asleep");
  }
  // the page went away: she is simply asleep when you come back, no animation saved up for your return
  function asleepNow() {
    if (face.talking) return; // she keeps talking while the tab is away; the typewriter is still going
    if (!face.tex.sleep || face.mode === "asleep") return;
    face.gen++; face.busy = false; face.tweening = false;
    face.dim = 0.8; cut("sleep"); setMode("asleep");
  }
  async function wake() {
    if (face.mode === "awake" || face.mode === "blinking" || face.mode === "waking") return;
    face.gen++; face.busy = false; // stop a fall that is still in progress
    const gen = face.gen;
    face.busy = true; setMode("waking");
    if (face.from === "sleep") await fade("sleep-half", 220, 0.92);
    if (gen === face.gen) await fade("open", 280, 1);
    if (gen !== face.gen) return;
    face.busy = false; setMode("awake");
    setTimeout(() => blink(), 450); // a waking blink
  }

  /* ---------- talking: while koyak.net types, her lips move (typewriter.js sends koyak:talk) ---------- */
  // closed -> half -> open -> half -> closed, with skips and uneven holds, so it reads as speech and not a loop
  // while she types the lips keep moving; they only meet for a beat now and then (her voice hums through it),
  // and they close properly only when the typing pauses (typewriter.js sends koyak:talk false then)
  const MOUTH = { open: ["talk-half", "talk-open"], "talk-half": ["talk-open", "talk-open", "open"], "talk-open": ["talk-half", "talk-half", "open"] };
  const SHAPE = { open: "shut", "talk-half": "half", "talk-open": "wide" };
  async function talkLoop(gen) {
    let cur = "open";
    while (face.talking && gen === face.gen) {
      if (!document.hidden) {
        const opts = MOUTH[cur]; cur = opts[Math.floor(Math.random() * opts.length)];
        face.dim = 1; cut(cur);
      }
      const hold = cur === "open" ? 45 + Math.random() * 40 : 60 + Math.random() * 90;
      // her voice (sound.js) follows the frame: full wide open, softer half open, a hum while the lips touch
      if (!document.hidden && window.koyakSound) window.koyakSound.voiceShape(SHAPE[cur]);
      await wait(hold);
    }
  }
  function startTalk() {
    if (!face.tex["talk-open"] || reduce.matches || face.talking) return;
    clearTimeout(idleTimer);
    face.gen++; face.busy = false; face.tweening = false; face.talking = true; // whatever she was doing, she wakes to talk
    setMode("talking");
    talkLoop(face.gen);
  }
  function stopTalk() {
    if (!face.talking) return;
    face.talking = false; face.gen++;
    face.dim = 1; cut("open"); setMode("awake");
    if (window.koyakSound) window.koyakSound.voiceStop(); // lips closed: silence
    activity();
  }
  window.addEventListener("koyak:talk", (e) => (e.detail && e.detail.talking ? startTalk() : stopTalk()));

  let idleTimer = 0;
  function activity() {
    if (face.talking) return;
    if (face.mode === "falling" || face.mode === "asleep") wake();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(sleep, IDLE_MS);
  }
  document.addEventListener("visibilitychange", () => {
    if (!face.tex.sleep) return;
    if (document.hidden) { clearTimeout(idleTimer); asleepNow(); }
    else draw(performance.now()); // repaint the sleeping frame before anything else happens
  });

  async function startFace(manifest) {
    const names = Object.keys(manifest).filter((n) => n !== "open");
    if (!manifest.open) return; // sprite sheets not built: keep the single plate
    const texs = await Promise.all(names.map((n) => texture(3, manifest[n])));
    names.forEach((n, i) => (face.tex[n] = texs[i]));
    cut("open"); setMode("awake");
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"])
      window.addEventListener(ev, activity, { passive: true, capture: true });
    activity(); scheduleBlink();
  }

  gl.uniform1i(U.uSubject, 0);
  gl.uniform1i(U.uTech, 1);
  gl.uniform1i(U.uSubjectB, 2);
  // the open-eyed sprite is the plate when frames exist, so nothing swaps after the develop
  fetch("assets/frames.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((manifest) => Promise.all([texture(0, manifest.open || "assets/plate-subject.png"), texture(1, "assets/plate-tech.png")])
      .then(([plain]) => {
        face.tex.open = plain;
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, plain);
        resize(); state.t0 = performance.now(); canvas.dataset.ready = "1"; kick();
        return startFace(manifest);
      }))
    .catch((e) => { console.error(e); if (!canvas.dataset.ready) useFallback(); });
})();
