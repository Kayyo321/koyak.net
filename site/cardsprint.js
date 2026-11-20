/* The edges of the three cards, printed with the same press as the plate and the wordmark:
   rotated AM screen, posterized tone, jittered dots and the same develop on load.
   One canvas sits behind the column; each box's border ring is laid into a tone plate and screened. */
(() => {
  const host = document.querySelector(".cards");
  if (!host) return;
  const canvas = document.createElement("canvas");
  canvas.className = "cards-print";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true });
  if (!gl) return; // the plain CSS outline stays

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const SEED = 11;

  const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision highp float;
    uniform sampler2D uTone;
    uniform vec2 uRes;
    uniform float uPitch, uDevelop, uSeed;

    const vec3 INK   = vec3(0.231, 0.259, 0.839);
    const vec3 PAPER = vec3(0.925, 0.933, 1.0);
    const float LEVELS = 6.0;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21) + uSeed * 0.137);
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
    float tone(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      float l = pow(texture2D(uTone, uv).r, 1.15);
      return floor(l * (LEVELS - 1.0) + 0.5) / (LEVELS - 1.0);
    }
    void main() {
      vec2 px = gl_FragCoord.xy;
      float dev = uDevelop * uDevelop * (3.0 - 2.0 * uDevelop);
      float pitch = mix(uPitch * 4.0, uPitch, dev);
      mat2 R = rot(radians(22.0)), Ri = rot(radians(-22.0));
      vec2 q = R * (px - uRes * 0.5) / pitch;
      vec2 base = floor(q);
      float best = 0.0, bt = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = base + vec2(float(i), float(j)) + 0.5;
        vec2 c = cell + (vec2(hash(cell), hash(cell.yx + 7.0)) - 0.5) * 0.25;
        float t = tone((Ri * (c * pitch) + uRes * 0.5) / uRes);
        if (t < 0.04) t = 0.0;
        float r = 0.5 * sqrt(t) * 1.42 * (0.92 + 0.16 * hash(cell + 3.0));
        float aa = 0.75 / pitch;
        float cov = 1.0 - smoothstep(r - aa, r + aa, length(q - c));
        if (t > 0.0 && cov > best) { best = cov; bt = t; }
      }
      vec3 dotc = mix(INK, PAPER, smoothstep(0.4, 0.95, bt));
      gl_FragColor = vec4(dotc * best, best); // premultiplied (see koyak.js)
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

  const U = {};
  for (const n of ["uTone", "uRes", "uPitch", "uDevelop", "uSeed"]) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1f(U.uSeed, SEED);
  gl.uniform1i(U.uTone, 0);

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const src = document.createElement("canvas");
  const ctx = src.getContext("2d");

  const BLEED = 3; // css px of room around the column so edge dots aren't clipped

  // tone plate: black, with each box's border ring drawn paper-white fading to mid ink downward
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hb = host.getBoundingClientRect();
    const cw = hb.width + BLEED * 2, ch = hb.height + BLEED * 2;
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    canvas.style.left = -BLEED + "px"; canvas.style.top = -BLEED + "px";
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    canvas.width = src.width = w; canvas.height = src.height = h;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
    const g = ctx.createLinearGradient(0, BLEED, 0, ch - BLEED);
    g.addColorStop(0, "#f2f2f2"); g.addColorStop(1, "#8a8a8a");
    ctx.strokeStyle = g;
    for (const card of host.querySelectorAll(".card")) {
      const r = card.getBoundingClientRect();
      const ring = parseFloat(getComputedStyle(card).borderTopWidth) || 3;
      ctx.lineWidth = ring;
      ctx.strokeRect(r.left - hb.left + BLEED + ring / 2, r.top - hb.top + BLEED + ring / 2, r.width - ring, r.height - ring);
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uPitch, 2.2 * dpr); // ~2 dot rows across the ring
    host.classList.add("is-printed");
  }

  const state = { develop: reduce.matches ? 1 : 0, t0: performance.now() };
  let raf = 0;
  function draw() {
    gl.uniform1f(U.uDevelop, state.develop);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    raf = 0;
    state.develop = Math.min(1, (now - state.t0) / 1600);
    draw();
    if (state.develop < 1) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (state.develop < 1) { if (!raf) raf = requestAnimationFrame(frame); } else draw(); };

  document.fonts.ready.then(() => {
    layout();
    state.t0 = performance.now();
    kick();
    new ResizeObserver(() => { layout(); kick(); }).observe(host);
    reduce.addEventListener("change", () => { state.develop = 1; kick(); });
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); host.classList.remove("is-printed"); canvas.hidden = true; });
  });
})();
