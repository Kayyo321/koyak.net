/* The send button is a paper airplane, printed by the same press as everything else on the page.
   On send it is thrown: it flies off to the right and dissolves dot by dot. When koyak.net has finished
   its turn it reassembles where it started, dot by dot, ready to be thrown again.
   typewriter.js announces turns with the "koyak:turn" event ({ turn: "ai" | "you" }). */
(() => {
  const btn = document.getElementById("writer-send");
  const canvas = btn && btn.querySelector(".plane");
  if (!canvas) return;
  const fallback = btn.querySelector(".plane-img");
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true });
  const noGL = () => { canvas.hidden = true; if (fallback) fallback.hidden = false; };
  if (!gl) return noGL();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision highp float;
    uniform sampler2D uTex;
    uniform vec2 uRes;
    uniform float uPitch, uDissolve, uSeed;
    const vec3 INK   = vec3(0.231, 0.259, 0.839);
    const vec3 PAPER = vec3(0.925, 0.933, 1.0);
    const float LEVELS = 7.0;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21) + uSeed * 0.137);
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
    float tone(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      vec4 c = texture2D(uTex, uv);
      float l = c.a * (0.12 + 0.88 * c.r);
      return floor(l * (LEVELS - 1.0) + 0.5) / (LEVELS - 1.0);
    }
    void main() {
      vec2 px = gl_FragCoord.xy;
      mat2 R = rot(radians(22.0)), Ri = rot(radians(-22.0));
      vec2 q = R * (px - uRes * 0.5) / uPitch;
      vec2 base = floor(q);
      float best = 0.0, bt = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = base + vec2(float(i), float(j)) + 0.5;
        vec2 c = cell + (vec2(hash(cell), hash(cell.yx + 7.0)) - 0.5) * 0.22;
        float t = tone((Ri * (c * uPitch) + uRes * 0.5) / uRes);
        if (t < 0.04) t = 0.0;
        // each dot leaves (or comes back) at its own moment, shrinking to nothing as it goes
        float keep = smoothstep(uDissolve * 1.12 - 0.12, uDissolve * 1.12, hash(cell + 19.0));
        float r = 0.5 * sqrt(t) * 1.42 * (0.94 + 0.12 * hash(cell + 3.0)) * keep;
        float aa = 0.75 / uPitch;
        // times keep: a dot shrunk to nothing would otherwise leave its soft edge behind as a faint speck
        float cov = (1.0 - smoothstep(r - aa, r + aa, length(q - c))) * keep;
        if (t > 0.0 && cov > best) { best = cov; bt = t; }
      }
      vec3 col = mix(INK, PAPER, smoothstep(0.35, 0.9, bt));
      gl_FragColor = vec4(col * best, best); // premultiplied (see koyak.js)
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
  } catch (e) { console.error(e); return noGL(); }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uTex", "uRes", "uPitch", "uDissolve", "uSeed"]) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uTex, 0); gl.uniform1f(U.uSeed, 23);

  const state = { dissolve: 0, ready: false };
  function draw() {
    if (!state.ready) return;
    gl.uniform1f(U.uDissolve, state.dissolve);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.dataset.dissolve = state.dissolve.toFixed(2);
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uPitch, Math.max(2.2, 1.7 * dpr)); // about the typewriter sheet's screen
    draw();
  }

  /* ---------- the throw and the return ---------- */
  const ease = (t) => t * t * (3 - 2 * t);
  let run = 0; // bumps on every new animation, so an old one stops where it is
  function animate(ms, step) {
    const id = ++run, t0 = performance.now();
    return new Promise((done) => {
      const tick = (now) => {
        if (id !== run) return done();
        const k = Math.min(1, (now - t0) / ms);
        step(k); draw();
        if (k < 1) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
  }
  const place = (x, y, deg, s) => { canvas.style.transform = `translate(${x}px, ${y}px) rotate(${deg}deg) scale(${s})`; };

  function fly() {
    btn.classList.add("is-flying");
    if (reduce.matches) return animate(320, (k) => { state.dissolve = k; }).then(() => btn.classList.remove("is-flying"));
    // along the nose (about 18 degrees above the horizon), speeding up, lifting, with a little yaw
    const D = Math.max(240, window.innerWidth * 0.42);
    return animate(1250, (k) => {
      const pull = k < 0.14 ? Math.sin((k / 0.14) * Math.PI) * -7 : 0; // drawn back for the throw
      const e = Math.pow(k, 1.7);
      const x = D * e + pull, y = -D * 0.32 * e - Math.sin(k * Math.PI) * 26;
      place(x, y, -7 * e + Math.sin(k * 9) * 2.5 * k, 1 - 0.22 * e);
      state.dissolve = ease(Math.min(1, Math.max(0, (k - 0.18) / 0.72)));
    }).then(() => { state.dissolve = 1; place(0, 0, 0, 1); draw(); btn.classList.remove("is-flying"); }); // gone: settle out of sight
  }
  function land() {
    place(0, 0, 0, 1);
    btn.classList.remove("is-flying"); // in case she answered before the throw was done
    return animate(reduce.matches ? 200 : 900, (k) => {
      state.dissolve = 1 - ease(k);
      if (!reduce.matches) place(0, 0, 0, 0.94 + 0.06 * ease(k));
    }).then(() => { canvas.style.transform = ""; btn.classList.remove("is-flying"); });
  }
  window.addEventListener("koyak:turn", (e) => (e.detail && e.detail.turn === "ai" ? fly() : land()));

  const img = new Image();
  img.onload = () => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    state.ready = true; canvas.dataset.ready = "1";
    resize();
    new ResizeObserver(resize).observe(canvas);
  };
  img.onerror = noGL;
  img.src = "assets/plane.png";
})();
