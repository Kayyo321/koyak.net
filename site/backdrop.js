/* The page's background as a slideshow. When the story asks for a slide (fx "slide"), the plate steps back and
   the whole page behind the typewriter becomes the scene: the server's drawing, printed live in the site's own
   dots, dark and grainy, drifting slowly, each new slide dissolving in cell by cell. fx "clear" hands the page
   back to her.

   A slide is a tonal drawing (an SVG): greys become the ink screen; reds and lamp-yellows come through as two
   spot inks on their own screen. { t: "slide", id, svg, ms, drift, focus: [x, y], shake, sting, hold }
     drift  in | out | left | right | up | down | still   the camera's slow move over the slide's life
     focus  where the subject sits on the slide (0..1); the crop keeps it where the plate used to be
     shake  0..1, a jolt that dies away     sting  a low hit on the speaker     hold  seconds the drift lasts
     fine   a smaller dot screen for a close-up (0.5..1 of the usual pitch), so a face keeps its detail
     scratches   set to false to omit the vertical film scratches for the slide
   { t: "flash", id, svg, ... } shows a drawing for one frame (a sixtieth of a second) and then whatever was on
   screen before, as if nothing had happened. An optional flickerMs shows three irregular glimpses over that
   interval. With reduced motion the glimpses are skipped and the interval is retained. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(max-width: 760px), (orientation: portrait)"); // same break as styles.css
  const root = document.documentElement;
  const stage = document.querySelector(".stage");
  const sound = () => window.koyakSound;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const TEX_W = 1120; // slides are rasterised this wide: the dot screen never needs more

  const canvas = document.createElement("canvas");
  canvas.className = "backdrop";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  document.body.insertBefore(canvas, stage);
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });

  /* ---------- slides: SVG in, a raster out (cached, so a cutscene can be fetched ahead) ---------- */
  const cache = new Map();
  function raster(f) {
    if (!f || !f.svg) return Promise.resolve(null);
    if (cache.has(f.svg)) return cache.get(f.svg);
    const p = new Promise((res) => {
      const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(f.svg);
      const aspect = vb ? +vb[1] / +vb[2] : 1.6;
      const w = TEX_W, h = Math.round(TEX_W / aspect);
      const src = f.svg.replace(/<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, "")} width="${w}" height="${h}">`);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d");
        x.fillStyle = "#000"; x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        res({ c, aspect, url: img.src });
      };
      img.onerror = () => res(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
    });
    cache.set(f.svg, p);
    return p;
  }

  /* ---------- the camera: cover the screen, keep the subject where she sat, drift, shake, weave ---------- */
  const DRIFT = {
    in: { z: [1.04, 1.14], p: [0, 0] }, out: { z: [1.16, 1.04], p: [0, 0] },
    left: { z: [1.1, 1.1], p: [0.045, 0] }, right: { z: [1.1, 1.1], p: [-0.045, 0] },
    up: { z: [1.1, 1.1], p: [0, 0.04] }, down: { z: [1.1, 1.1], p: [0, -0.04] },
    still: { z: [1.05, 1.06], p: [0, 0] },
  };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function camera(sl, now) {
    const v = canvas.width / canvas.height, s = sl.aspect, f = sl.f;
    const still = reduce.matches;
    const t = (now - sl.t0) / 1000;
    const d = DRIFT[f.drift] || DRIFT.in;
    const k = still ? 0.5 : Math.min(t / (f.hold || 16), 1);
    const e = 1 - (1 - k) * (1 - k);
    const zoom = d.z[0] + (d.z[1] - d.z[0]) * e;
    // a tall screen would crop a wide slide to a sliver: there it shows more of the slide, as a band across
    // the middle that fades to black above and below, instead of covering the whole screen
    const band = v < s * 0.8;
    const wx = band ? Math.min(1, (v / s) * 2.1) : 1;
    const ws = (band ? [wx, (wx * s) / v] : v > s ? [1, s / v] : [v / s, 1]).map((x) => x / zoom);
    const focus = f.focus || [0.62, 0.5];
    const anchor = narrow.matches ? [0.5, 0.36] : [0.66, 0.5]; // where the plate's figure is
    let ox = focus[0] + d.p[0] * (e - 0.5) - anchor[0] * ws[0];
    let oy = focus[1] + d.p[1] * (e - 0.5) - anchor[1] * ws[1];
    if (!still) {
      const q = Math.floor(now / 83); // gate weave, twelve times a second
      ox += (hash(q) - 0.5) * 0.0018; oy += (hash(q + 7) - 0.5) * 0.0018;
      if (f.shake) {
        const amp = f.shake * 0.03 * Math.exp(-t * 2.6);
        ox += (hash(q * 3.1) - 0.5) * amp; oy += (hash(q * 5.7) - 0.5) * amp;
      }
    }
    return [clamp(ox, 0, Math.max(0, 1 - ws[0])), ws[1] > 1 ? oy : clamp(oy, 0, 1 - ws[1]), ws[0], ws[1]];
  }

  /* ---------- tweens ---------- */
  const tw = (v) => ({ from: v, to: v, t0: 0, ms: 1 });
  const val = (x, now) => { const k = clamp((now - x.t0) / x.ms, 0, 1); return x.from + (x.to - x.from) * k; };
  const done = (x, now) => now - x.t0 >= x.ms;
  function go(x, to, ms, now) { x.from = val(x, now); x.to = to; x.t0 = now; x.ms = reduce.matches ? 1 : Math.max(1, ms); }
  const S = { show: tw(0), mix: tw(0), a: null, b: null };
  let flashing = null;
  function stopFlash() {
    const current = flashing;
    flashing = null;
    current?.resolve?.();
  }

  // Brief, uneven flashes with darkness in between, and a final glimpse close to the blackout.
  function flickerPulses(ms) {
    return [[0.08, 0.20], [0.36, 0.52], [0.75, 0.91]].map(([from, to]) => {
      const start = ms * (from + (to - from) * Math.random());
      return { start, end: Math.min(ms, start + 25 + 25 * Math.random()), power: 0.8 + 0.2 * Math.random() };
    });
  }

  let raf = 0, flicker = 1, flickerSlot = -1;
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // no WebGL: the drawing itself, darkened and tinted, behind the stage
  let flat = null;
  if (!gl) {
    flat = document.createElement("img");
    flat.className = "backdrop backdrop-flat";
    flat.alt = ""; flat.hidden = true;
    document.body.insertBefore(flat, stage);
    canvas.remove();
  }

  let prog = null, U = {}, texA = null, texB = null;
  if (gl) {
    const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
    const frag = `
      precision highp float;
      uniform sampler2D uA, uB;
      uniform vec4 uXfA, uXfB;     // slide window: origin xy, size zw (slide uv, y down)
      uniform float uMix, uShow, uTime, uPitch, uMotion, uFlicker, uScratches;
      uniform vec2 uRes;
      const vec3 DEEP  = vec3(0.004, 0.004, 0.043);
      const vec3 NIGHT = vec3(0.027, 0.035, 0.212);
      const vec3 INK   = vec3(0.231, 0.259, 0.839);
      const vec3 LILAC = vec3(0.682, 0.698, 0.949);
      const vec3 PAPER = vec3(0.925, 0.933, 1.0);
      const vec3 RED   = vec3(0.847, 0.157, 0.247);
      const vec3 LAMP  = vec3(1.0, 0.906, 0.659);
      const float LEVELS = 7.0;

      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

      // the slide under a screen cell: A or B, chosen per cell while one dissolves into the other
      // past a slide's edge is black, and the last few percent fade into it
      float edge(vec2 u) { vec2 e = smoothstep(vec2(0.0), vec2(0.07), u) * smoothstep(vec2(1.0), vec2(0.93), u); return e.x * e.y; }
      vec3 sampleAt(vec2 c, vec2 cell) {
        vec2 suv = vec2(c.x, uRes.y - c.y) / uRes;
        vec2 ua = uXfA.xy + suv * uXfA.zw, ub = uXfB.xy + suv * uXfB.zw;
        vec3 a = texture2D(uA, ua).rgb * edge(ua);
        vec3 b = texture2D(uB, ub).rgb * edge(ub);
        return (uMix > 0.0 && hash(cell + 17.0) < uMix) ? b : a;
      }
      float vignette(vec2 c) {
        vec2 suv = c / uRes;
        vec2 d = (suv - vec2(0.6, 0.52)) * vec2(uRes.x / uRes.y, 1.0);
        return smoothstep(1.05, 0.18, length(d));
      }
      void main() {
        vec2 px = gl_FragCoord.xy;
        float slot = floor(uTime * 12.0) * uMotion;

        // the ink screen, 22 degrees like every other press on the page
        mat2 R = rot(radians(22.0)), Ri = rot(radians(-22.0));
        vec2 q = R * px / uPitch;
        vec2 cell = floor(q) + 0.5;
        vec2 c = Ri * (cell * uPitch);
        vec3 s = sampleAt(c, cell);
        float L = dot(s, vec3(0.299, 0.587, 0.114));
        L += (hash(cell + slot * 0.731) - 0.5) * 0.07 * uMotion;   // the dots boil a little, frame to frame
        L *= uFlicker * mix(0.3, 1.0, vignette(c));
        L = pow(clamp(L, 0.0, 1.0), 1.12);
        float Lp = floor(L * (LEVELS - 1.0) + 0.5) / (LEVELS - 1.0);
        float aa = 0.9 / uPitch;
        float r = 0.52 * sqrt(Lp);
        float cov = 1.0 - smoothstep(r - aa, r + aa, length(q - cell));
        vec3 dotc = Lp < 0.45 ? mix(INK * 0.62, INK, Lp / 0.45)
                  : Lp < 0.8 ? mix(INK, LILAC, (Lp - 0.45) / 0.35) : mix(LILAC, PAPER, (Lp - 0.8) / 0.2);
        vec3 bg = mix(DEEP, NIGHT, 0.25 + 0.75 * smoothstep(0.0, 0.5, L));
        vec3 col = mix(bg, dotc, cov);

        // two spot inks on their own screen, a hair out of register
        mat2 R2 = rot(radians(67.0)), R2i = rot(radians(-67.0));
        float p2 = uPitch * 0.86;
        vec2 q2 = R2 * (px + vec2(0.7, -0.5)) / p2;
        vec2 cell2 = floor(q2) + 0.5;
        vec2 c2 = R2i * (cell2 * p2) - vec2(0.7, -0.5);
        vec3 s2 = sampleAt(c2, floor(R * c2 / uPitch) + 0.5);
        // a colour prints as big as it is strong and bright: a dark red is a few small dots, not a flood
        float lamp = clamp((min(s2.r, s2.g) - s2.b) * 2.0, 0.0, 1.0) * sqrt(s2.g);
        float red = clamp((s2.r - max(s2.g, s2.b)) * 1.7 - lamp, 0.0, 1.0) * sqrt(s2.r);
        float spot = max(red, lamp) * uFlicker * mix(0.35, 1.0, vignette(c2));
        float r2 = 0.5 * sqrt(spot);
        float cov2 = (1.0 - smoothstep(r2 - aa, r2 + aa, length(q2 - cell2))) * step(0.04, spot);
        col = mix(col, red > lamp ? RED : LAMP, cov2 * 0.95);

        // the film: grain, dust, a scratch now and then
        col += (hash(floor(px / 2.0) + slot * vec2(0.913, 0.377)) - 0.5) * 0.045 * uMotion;
        float sn = floor(uTime * 7.0);
        if (uMotion > 0.0 && uScratches > 0.0 && hash(vec2(sn, 1.3)) > 0.62) {
          float x0 = hash(vec2(sn, 2.9)) * uRes.x + sin(px.y * 0.013 + sn) * 3.0;
          float line = 1.0 - smoothstep(0.0, 0.9 + hash(vec2(sn, 4.1)) * 1.4, abs(px.x - x0));
          line *= step(0.35, hash(vec2(floor(px.y / 37.0), sn)));
          col = mix(col, LILAC * 0.7, line * 0.4);
        }
        vec2 dc = floor(px / 26.0);
        float dust = hash(dc + vec2(slot * 0.117, slot * 0.291));
        if (uMotion > 0.0 && dust > 0.9972) {
          float dr = 1.0 + hash(dc + 3.3) * 2.2;
          float din = 1.0 - smoothstep(dr - 0.8, dr + 0.8, length(px - (dc + 0.5) * 26.0));
          col = mix(col, hash(dc + 9.1) > 0.5 ? PAPER * 0.75 : DEEP, din * 0.8);
        }

        // in and out, a few cells at a time
        float vis = step(hash(floor(cell / 2.0) + 3.0), uShow * 1.0001);
        gl_FragColor = vec4(col * vis, vis); // premultiplied (see koyak.js)
      }`;
    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.error(e); prog = null; }
    if (prog) {
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ["uA", "uB", "uXfA", "uXfB", "uMix", "uShow", "uTime", "uPitch", "uMotion", "uFlicker", "uScratches", "uRes"]) U[n] = gl.getUniformLocation(prog, n);
      const tex = (unit) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        return t;
      };
      texA = tex(0); texB = tex(1);
      gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);
    }
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); prog = null; canvas.hidden = true; stopFlash(); });
  }
  function upload(unit, t, c) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  function resize() {
    if (!prog) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    basePitch = Math.max(4, 6.2 * dpr);
  }
  let basePitch = 6.2;
  window.addEventListener("resize", () => { resize(); kick(); });

  function frame(now) {
    raf = 0;
    if (!prog) return;
    // a mix that has finished: the incoming slide becomes the one on screen
    if (S.b && done(S.mix, now) && S.mix.to === 1) {
      S.a = S.b; S.b = null;
      upload(0, texA, S.a.c);
      S.mix = tw(0);
    }
    // A single flash ends after one frame (two on a 120 Hz screen).
    if (flashing?.resolve && (reduce.matches || (flashing.drawnAt && now - flashing.drawnAt >= 15))) stopFlash();
    let flashPower = 0;
    if (flashing && !reduce.matches) {
      const elapsed = now - flashing.sl.t0;
      flashPower = flashing.pulses
        ? flashing.pulses.find(({ start, end }) => elapsed >= start && elapsed < end)?.power ?? 0
        : 1;
    }
    const lit = flashPower > 0;
    const show = lit ? 1 : val(S.show, now);
    if (show <= 0 && done(S.show, now)) {
      canvas.hidden = true;
      if (flashing) kick();
      return;
    }
    canvas.hidden = false;
    if (!reduce.matches) {
      const slot = Math.floor(now / 83);
      if (slot !== flickerSlot) { flickerSlot = slot; const r = hash(slot * 1.7); flicker = r > 0.97 ? 0.72 : 0.9 + 0.1 * hash(slot * 2.3); }
    } else flicker = 1;
    gl.uniform1f(U.uTime, now / 1000);
    gl.uniform1f(U.uMotion, reduce.matches ? 0 : 1);
    gl.uniform1f(U.uFlicker, flicker * (flashPower || 1));
    gl.uniform1f(U.uShow, show);
    const incoming = lit ? flashing.sl : S.b;
    const displayed = (incoming || S.a)?.f;
    const fine = clamp(Number(displayed?.fine) || 1, 0.5, 1); // the incoming slide sets the screen
    gl.uniform1f(U.uScratches, displayed?.scratches === false ? 0 : 1);
    gl.uniform1f(U.uPitch, Math.max(3, basePitch * fine));
    gl.uniform1f(U.uMix, lit ? 1 : S.b ? val(S.mix, now) : 0);
    if (S.a) gl.uniform4fv(U.uXfA, camera(S.a, now));
    if (incoming) gl.uniform4fv(U.uXfB, camera(incoming, now));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (lit && flashing.resolve && !flashing.drawnAt) flashing.drawnAt = now;
    raf = requestAnimationFrame(frame);
  }

  /* ---------- what the story calls ---------- */
  let on = false;
  function enter() {
    if (on) return;
    on = true;
    root.dataset.scene = "1"; // styles.css: the plate steps back, the title dims
    sound()?.drone?.(true);
  }
  async function slide(f) {
    const r = await raster(f);
    if (!r) return;
    stopFlash();
    const now = performance.now();
    const ms = f.ms ?? 1400;
    if (f.sting) sound()?.sting?.({ gain: f.sting === true ? 1 : f.sting });
    enter();
    if (flat) {
      flat.src = r.url; flat.hidden = false;
      await wait(reduce.matches ? 0 : Math.min(ms, 1600));
      return;
    }
    if (!prog) return;
    resize();
    const sl = { f, aspect: r.aspect, c: r.c, t0: now };
    if (S.b) { S.a = S.b; S.b = null; upload(0, texA, S.a.c); S.mix = tw(0); } // finish a dissolve still under way
    if (!S.a || S.show.to === 0 || val(S.show, now) === 0) {
      S.a = sl; upload(0, texA, sl.c);
      go(S.show, 1, ms, now);
    } else {
      S.b = sl; upload(1, texB, sl.c);
      S.mix = tw(0); go(S.mix, 1, ms, now);
    }
    kick();
    await wait(reduce.matches ? 0 : Math.min(ms, 1600));
  }
  async function flash(f) {
    const ms = f.flickerMs ?? 0;
    const r = reduce.matches || flat || !prog ? null : await raster(f);
    if (!r || reduce.matches || !prog) {
      if (ms) await wait(ms);
      return;
    }
    if (f.sting) sound()?.sting?.({ gain: f.sting === true ? 1 : f.sting });
    resize();
    if (S.b) { S.a = S.b; S.b = null; upload(0, texA, S.a.c); S.mix = tw(0); } // settle a dissolve first
    upload(1, texB, r.c);
    stopFlash();
    const sl = { f, aspect: r.aspect, c: r.c, t0: performance.now() };
    if (ms) {
      const effect = { sl, pulses: flickerPulses(ms) };
      flashing = effect;
      kick();
      await wait(ms);
      if (flashing === effect) stopFlash();
      return;
    }
    await new Promise((resolve) => {
      flashing = { sl, drawnAt: 0, resolve };
      kick();
    });
  }
  async function clear(ms = 1200) {
    stopFlash();
    if (!on) return;
    on = false;
    delete root.dataset.scene;
    sound()?.drone?.(false);
    if (flat) { flat.hidden = true; return; }
    go(S.show, 0, ms, performance.now());
    kick();
    await wait(reduce.matches ? 0 : ms);
  }

  window.koyakBackdrop = { slide, flash, clear, preload: raster, get on() { return on; } };
})();
