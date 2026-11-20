/* "koyak", printed with the same press as the plate: rotated AM screen, posterized tone,
   seeded offset crops and the same develop on load. No pointer interaction. */
(() => {
  const host = document.getElementById("koyak");
  const canvas = document.getElementById("koyak-canvas");
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) return; // the plain type stays visible

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const SEED = 7;
  const RIP = window.koyakRipples; // ripple.js: pressing the title sets the word swaying

  const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision highp float;
    uniform sampler2D uText;
    uniform vec2 uRes;
    uniform float uPitch, uTime, uDevelop, uMotion, uSeed;
    uniform vec4 uCrop[4];
    uniform vec4 uCropP[4];
    ${RIP ? RIP.glsl : "vec3 ripple(vec2 p, float r) { return vec3(0.0); } vec2 ripClient(vec2 p) { return p; }"}

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

    float tone(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      float l = pow(texture2D(uText, uv).r, 1.15);
      return floor(l * (LEVELS - 1.0) + 0.5) / (LEVELS - 1.0);
    }

    vec2 screen(vec2 px, float pitch, float ang, vec2 shift, float salt) {
      mat2 R = rot(ang), Ri = rot(-ang);
      vec2 q = R * (px - uRes * 0.5) / pitch;
      vec2 base = floor(q);
      float best = 0.0, bt = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = base + vec2(float(i), float(j)) + 0.5;
        vec2 c = cell + (vec2(hash(cell + salt), hash(cell.yx + salt + 7.0)) - 0.5) * 0.25;
        vec2 cuv = (Ri * (c * pitch) + uRes * 0.5) / uRes + shift;
        float t = tone(cuv);
        if (t < 0.04 && hash(cell + salt + 99.0) < 0.85) t = 0.0;
        float r = 0.5 * sqrt(t) * 1.42 * (0.92 + 0.16 * hash(cell + salt + 3.0));
        float aa = 0.75 / pitch;
        float cov = 1.0 - smoothstep(r - aa, r + aa, length(q - c));
        if (t > 0.0 && cov > best) { best = cov; bt = t; }
      }
      return vec2(best, bt);
    }

    void main() {
      vec2 px = gl_FragCoord.xy;
      // the title sits in the ripple's own water: its dots bend with every crest that runs through
      vec3 rw = ripple(ripClient(px), 260.0);
      px += vec2(rw.y, -rw.z) * 7.0 * uRipView.z;
      vec2 uv = px / uRes;
      float dev = uDevelop * uDevelop * (3.0 - 2.0 * uDevelop);
      float pitch = mix(uPitch * 4.0, uPitch, dev);
      float ang = radians(22.0);

      vec2 s = screen(px, pitch, ang, vec2(0.0), 0.0);
      float frame = 0.0;
      for (int k = 0; k < 4; k++) {
        vec4 r = uCrop[k];
        if (uv.x > r.x && uv.y > r.y && uv.x < r.x + r.z && uv.y < r.y + r.w) {
          vec4 p = uCropP[k];
          vec2 drift = vec2(sin(uTime * 0.21 + float(k) * 1.7), 0.0) * 0.004 * uMotion;
          s = screen(px, pitch * p.x, ang + radians(p.y), p.zw + drift, float(k) + 11.0);
          vec2 e = min(uv - r.xy, r.xy + r.zw - uv) * uRes;
          frame = max(frame, 1.0 - smoothstep(0.0, 1.2, min(e.x, e.y)));
        }
      }

      vec3 dotc = mix(INK, PAPER, smoothstep(0.4, 0.95, s.y));
      float f = frame * 0.22;
      // transparent paper between the dots, so the word floats over whatever is behind it
      gl_FragColor = s.x >= f ? vec4(dotc, s.x) : vec4(PAPER, f);
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
  } catch (e) { console.error(e); return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  for (const n of ["uText", "uRes", "uPitch", "uTime", "uDevelop", "uMotion", "uSeed", "uCrop", "uCropP"])
    U[n] = gl.getUniformLocation(prog, n);

  // seeded misregistered strips across the word (GL uv, y up)
  function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rand = rng(SEED * 7919);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const crops = [], cropP = [];
  for (let k = 0; k < 4; k++) {
    const w = 0.08 + rand() * 0.22, h = 0.08 + rand() * 0.22;
    crops.push(0.04 + rand() * (0.9 - w), 0.18 + rand() * (0.62 - h), w, h);
    cropP.push(pick([0.55, 1.8, 1.4]), pick([0, 23]), (rand() * 2 - 1) * 0.012, (rand() * 2 - 1) * 0.02);
  }
  gl.uniform4fv(U.uCrop, crops);
  gl.uniform4fv(U.uCropP, cropP);
  gl.uniform1f(U.uSeed, SEED);
  gl.uniform1i(U.uText, 0);
  const feedRipples = RIP ? RIP.bind(gl, prog, canvas) : () => {};

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const src = document.createElement("canvas");
  const ctx = src.getContext("2d");

  // lay the word into a tone plate the exact size of the type box, plus a bleed for the descender of "y"
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cs = getComputedStyle(host);
    const box = host.getBoundingClientRect();
    const bleed = Math.ceil(parseFloat(cs.fontSize) * 0.12);
    const cw = box.width + bleed * 2, ch = box.height + bleed * 2;
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    canvas.style.left = -bleed + "px"; canvas.style.top = -bleed + "px";
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    canvas.width = src.width = w; canvas.height = src.height = h;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText("koyak");
    const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
    const desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
    const baseline = bleed + (box.height - (asc + desc)) / 2 + asc;
    // tone falls from paper-white at the cap line to mid ink at the baseline, so the screen shows
    const g = ctx.createLinearGradient(0, baseline - asc * 0.75, 0, baseline + desc);
    g.addColorStop(0, "#f2f2f2"); g.addColorStop(0.5, "#b4b4b4"); g.addColorStop(1, "#5a5a5a");
    ctx.fillStyle = g;
    ctx.fillText("koyak", bleed, baseline);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    // the word's strokes carry ~14 dots across the cap height
    gl.uniform1f(U.uPitch, Math.max(3 * dpr, h / 64));
  }

  const state = { develop: reduce.matches ? 1 : 0, t0: performance.now(), visible: true };
  let raf = 0, timer = 0;
  function frame(now) {
    raf = 0;
    if (state.develop < 1) state.develop = Math.min(1, (now - state.t0) / 1600);
    gl.uniform1f(U.uTime, (now - state.t0) / 1000);
    gl.uniform1f(U.uDevelop, state.develop);
    gl.uniform1f(U.uMotion, reduce.matches ? 0 : 1);
    feedRipples(now);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (state.develop < 1 || (RIP && RIP.active(now))) raf = requestAnimationFrame(frame);
    else if (!reduce.matches && state.visible) { clearTimeout(timer); timer = setTimeout(kick, 50); }
  }
  const kick = () => { if (!raf && state.visible) raf = requestAnimationFrame(frame); };

  document.fonts.load(`700 100px "Big Shoulders"`).then(() => document.fonts.ready).then(() => {
    layout();
    host.classList.add("is-printed");
    state.t0 = performance.now();
    kick();
    new ResizeObserver(() => { layout(); kick(); }).observe(host);
    window.addEventListener("koyak:ripple", () => { clearTimeout(timer); raf = raf || requestAnimationFrame(frame); });
    document.addEventListener("visibilitychange", () => { state.visible = !document.hidden; kick(); });
    reduce.addEventListener("change", () => { state.develop = 1; kick(); });
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); host.classList.remove("is-printed"); canvas.hidden = true; });
  });
})();
