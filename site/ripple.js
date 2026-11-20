/* Ripples. Pressing the title (the word, ".net" or any of the three cards) drops a stone at that point and a
   ring of waves runs outward: strong in the title's own background, fading to a breath over the rest of the
   page, and just reaching the girl, whose dots bend a little as it passes.
   One wave model lives here. Every press that wants to feel it (this overlay, the wordmark, the plate) pastes
   RIPPLE_GLSL into its shader and calls bind() to feed it the live ripples in page (client css px) terms. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const MAX = 4, LIFE = 3.2; // ripples at once; seconds before one has spread to nothing
  const list = []; // { x, y, t0, s }

  const GLSL = `
    uniform vec4 uRip[4];   // client x, client y, age (s), strength (0 = unused)
    uniform vec3 uRipView;  // this canvas's top-left in client px, device px per css px
    const float RIP_SPEED = 560.0, RIP_LAMBDA = 54.0, RIP_WIDTH = 95.0;
    vec2 ripClient(vec2 fragPx) { return uRipView.xy + vec2(fragPx.x, uRes.y - fragPx.y) / uRipView.z; }
    // the water at client point p: x = height (-1..1), yz = slope direction (client px, y down) scaled by height.
    // reach: how far (css px) a ripple carries before it has fallen to half strength
    vec3 ripple(vec2 p, float reach) {
      vec3 o = vec3(0.0);
      for (int k = 0; k < 4; k++) {
        vec4 r = uRip[k];
        if (r.w <= 0.0) continue;
        vec2 d = p - r.xy;
        float dist = max(length(d), 1e-3);
        float x = dist - r.z * RIP_SPEED;                    // ahead of (>0) or behind (<0) the leading crest
        float env = exp(-x * x / (RIP_WIDTH * RIP_WIDTH))    // a packet of three or four crests
                  * exp(-r.z / 1.05)                         // dying away
                  * smoothstep(0.0, 0.07, r.z)               // the stone going in
                  / (1.0 + dist / reach) * r.w;
        float ph = x * 6.2831853 / RIP_LAMBDA;
        o.x += sin(ph) * env;
        o.yz += cos(ph) * env * (d / dist);
      }
      return o;
    }`;
  const STUB = `vec3 ripple(vec2 p, float reach) { return vec3(0.0); } vec2 ripClient(vec2 p) { return p; }`;

  const packed = new Float32Array(MAX * 4);
  function pack(now) {
    packed.fill(0);
    let n = 0;
    for (const r of list) {
      const age = (now - r.t0) / 1000;
      if (age >= LIFE || n >= MAX) continue;
      packed.set([r.x, r.y, age, r.s], n * 4); n++;
    }
    return packed;
  }
  const active = (now = performance.now()) => list.some((r) => now - r.t0 < LIFE * 1000);

  // hand a press its ripples: call the returned function each frame, after gl.useProgram, before drawing
  function bind(gl, prog, canvas) {
    const uRip = gl.getUniformLocation(prog, "uRip"), uView = gl.getUniformLocation(prog, "uRipView");
    if (!uRip || !uView) return () => {};
    let idle = false;
    return (now = performance.now()) => {
      const on = active(now);
      if (!on && idle) return; // already told it the water is still
      idle = !on;
      const r = canvas.getBoundingClientRect();
      gl.uniform3f(uView, r.left, r.top, canvas.width / Math.max(1, r.width));
      gl.uniform4fv(uRip, pack(now));
    };
  }

  function drop(x, y, s = 1) {
    if (reduce.matches) return;
    const now = performance.now();
    for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 >= LIFE * 1000) list.splice(i, 1);
    if (list.length >= MAX) list.shift();
    list.push({ x, y, t0: now, s });
    window.dispatchEvent(new CustomEvent("koyak:ripple", { detail: { x, y } }));
  }

  window.koyakRipples = { glsl: GLSL, stub: STUB, bind, active, drop, LIFE };

  /* ---------- the overlay: the page's own background, which shows the water as dots ---------- */
  const stage = document.querySelector(".stage");
  const canvas = document.createElement("canvas");
  canvas.className = "ripples";
  canvas.setAttribute("aria-hidden", "true");
  stage.prepend(canvas);
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });

  const title = document.querySelector(".title");
  if (title) title.addEventListener("pointerdown", (e) => { if (e.button === 0 || e.pointerType !== "mouse") drop(e.clientX, e.clientY); });

  if (!gl) return;
  const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uPitch;
    ${GLSL}
    const vec3 INK   = vec3(0.231, 0.259, 0.839);
    const vec3 LILAC = vec3(0.682, 0.698, 0.949);
    const vec3 PAPER = vec3(0.925, 0.933, 1.0);
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
    void main() {
      // the same 22 degree screen as every other press on the page, laid in page space so it never swims
      vec2 p = ripClient(gl_FragCoord.xy);
      mat2 R = rot(radians(22.0)), Ri = rot(radians(-22.0));
      vec2 q = R * p / uPitch;
      vec2 cell = floor(q) + 0.5;
      vec2 c = Ri * (cell * uPitch);
      vec3 w = ripple(c, 150.0);
      float h = w.x;
      // crests print as pale dots, troughs as ink: rings of light and shadow on dark water
      float a = clamp(abs(h) * 1.25, 0.0, 1.0);
      float r = 0.47 * sqrt(a);
      float aa = 0.8 / (uPitch * uRipView.z);
      float cov = 1.0 - smoothstep(r - aa, r + aa, length(q - cell));
      vec3 col = h > 0.0 ? mix(LILAC, PAPER, smoothstep(0.3, 0.9, h)) : INK;
      float alpha = cov * (h > 0.0 ? 0.72 : 0.7) * smoothstep(0.02, 0.1, a);
      gl_FragColor = vec4(col * alpha, alpha);
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
  } catch (e) { console.error(e); canvas.remove(); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes"), uPitch = gl.getUniformLocation(prog, "uPitch");
  const feed = bind(gl, prog, canvas);

  function resize() {
    // the dots are big and soft: a little under the screen's resolution is plenty
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uPitch, 7);
  }
  let raf = 0;
  function frame(now) {
    raf = 0;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!active(now)) { canvas.dataset.live = "0"; return; }
    canvas.dataset.live = "1";
    feed(now);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener("koyak:ripple", () => { if (!raf) raf = requestAnimationFrame(frame); });
  resize();
  new ResizeObserver(resize).observe(canvas);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); canvas.hidden = true; });
})();
