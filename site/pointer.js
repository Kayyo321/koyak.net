/* The pointer's loupe: a small spinning shape (circle, triangle, square, star, heart, circle...) printed as a ring
   of paper dots close around the cursor. It only shows over something that can be clicked (anything whose cursor
   is a pointer, a zoom or a grab), so it says "this does something" and stays off her face and off plain paper.
   Arriving, it whirls in from a point with an overshoot and its edge draws itself round like a clock hand;
   leaving, it runs backwards. */
(() => {
  const R_CSS = 17;   // the circle's radius in CSS px, hugging the cursor; the other shapes are sized to match it
  const BOX = 64;     // the canvas around it, in CSS px (room for the widest shape at the top of its overshoot)
  const CLICKY = new Set(["pointer", "zoom-in", "zoom-out", "grab"]);

  const canvas = document.createElement("canvas");
  canvas.className = "pointer-loupe";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.width = canvas.style.height = BOX + "px";
  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });
  if (!gl) { canvas.remove(); return; }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  const vert = `
    attribute vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const frag = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime, uLens, uMotion, uDpr, uR;
    const vec3 NIGHT = vec3(0.027, 0.035, 0.212);
    const vec3 PAPER = vec3(0.925, 0.933, 1.0);
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

    /* the shapes (signed distances, after Inigo Quilez), the same five the plate's loupe used */
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
    // 0 circle, 1 triangle, 2 square, 3 star, 4 heart
    float shape(int i, vec2 p, float R) {
      if (i == 0) return length(p) - R;
      if (i == 1) return sdTri(p, R * 1.05);
      if (i == 2) return sdBox(p, R * 0.84);
      if (i == 3) return sdStar(p, R * 1.18, 0.45);
      float s = R * 1.6;
      return sdHeart(p / s + vec2(0.0, 0.52)) * s;
    }

    void main() {
      vec2 px = gl_FragCoord.xy;
      float e = clamp(uLens, 0.0, 1.0), b = e - 1.0;
      float pop = max(1.0 + 2.70158 * b * b * b + 1.70158 * b * b, 0.0);
      float R = max(uR * uDpr * pop, 1e-4);
      float spin = uTime * 0.9 * uMotion + (1.0 - e) * 5.0;
      vec2 p = rot(spin) * (px - uRes * 0.5);
      float seg = uTime / 1.7 * uMotion;
      int i0 = int(mod(floor(seg), 5.0)), i1 = int(mod(floor(seg) + 1.0, 5.0));
      float d = mix(shape(i0, p, R), shape(i1, p, R), smoothstep(0.55, 1.0, fract(seg)));
      // the edge, printed as a ring of fine paper dots, each with a rim of night so it reads on light things too
      float cell = 3.0 * uDpr;
      float hw = 0.6 * cell, aa = 0.75;
      float band = 1.0 - smoothstep(hw - aa, hw + aa, abs(d));
      float r = length(fract(px / cell) - 0.5);
      float core = 1.0 - smoothstep(0.22, 0.32, r);
      float dotm = 1.0 - smoothstep(0.36, 0.47, r);
      float wipe = step(atan(p.y, p.x) / 6.2831853 + 0.5, smoothstep(0.0, 0.75, e));
      float a = band * dotm * wipe * 0.95;
      vec3 col = mix(NIGHT, PAPER, core / max(dotm, 1e-3));
      gl_FragColor = vec4(col * a, a);
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
  } catch (e) { console.error(e); canvas.remove(); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uRes", "uTime", "uLens", "uMotion", "uDpr", "uR"]) U[n] = gl.getUniformLocation(prog, n);

  let dpr = 0;
  function resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (d === dpr) return;
    dpr = d;
    canvas.width = canvas.height = Math.round(BOX * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uR, R_CSS);
  }
  resize();

  const ptr = { x: 0, y: 0, known: false, touch: false };
  const state = { lens: 0, target: 0, t0: performance.now(), last: 0 };

  // over something clickable? (read in the frame, after the page's own handlers have set their cursors)
  function over() {
    if (!ptr.known || ptr.touch || document.hidden) return false;
    const el = document.elementFromPoint(ptr.x, ptr.y);
    return !!el && CLICKY.has(getComputedStyle(el).cursor);
  }
  function place() {
    // whole device pixels, so the dots stay crisp
    const x = Math.round((ptr.x - BOX / 2) * dpr) / dpr, y = Math.round((ptr.y - BOX / 2) * dpr) / dpr;
    canvas.style.transform = `translate(${x}px, ${y}px)`;
  }

  let raf = 0, followUntil = 0;
  function frame(now) {
    raf = 0;
    resize();
    state.target = over() ? 1 : 0;
    // arrives in ~0.4 s, leaves in ~0.3 s (the shader shapes both from this one number)
    const dt = Math.min(64, now - (state.last || now)); state.last = now;
    if (reduce.matches) state.lens = state.target;
    else if (state.lens < state.target) state.lens = Math.min(state.target, state.lens + dt / 400);
    else if (state.lens > state.target) state.lens = Math.max(state.target, state.lens - dt / 300);
    canvas.style.visibility = state.lens > 0 ? "visible" : "hidden";
    if (state.lens > 0) {
      place();
      gl.uniform1f(U.uTime, (now - state.t0) / 1000);
      gl.uniform1f(U.uLens, state.lens);
      gl.uniform1f(U.uMotion, reduce.matches ? 0 : 1);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // keep going while it is on screen (it spins), while it comes or goes, and while the page slides under a still cursor
    if (state.lens > 0 || state.lens !== state.target || now < followUntil) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  window.addEventListener("pointermove", (e) => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.known = true; ptr.touch = e.pointerType === "touch";
    kick();
  }, { passive: true, capture: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.known = false; kick(); });
  window.addEventListener("blur", () => { ptr.known = false; kick(); });
  // things change under a cursor that isn't moving: the page lifts, a sheet opens, a button is enabled
  const follow = (ms) => { followUntil = Math.max(followUntil, performance.now() + ms); kick(); };
  window.addEventListener("koyak:lift", () => follow(1300));
  for (const t of ["transitionrun", "transitionend", "click", "keydown"]) document.addEventListener(t, () => follow(400), { passive: true, capture: true });
  document.addEventListener("visibilitychange", kick);
})();
