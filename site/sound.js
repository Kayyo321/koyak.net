/* The room's sound, all synthesized (no samples to load): the typewriter's strike, its space bar and carriage
   return (the lever, the carriage dragged home over its ratchet, the stop), and koyak.net's voice while it
   types: one flowing line of vowel babble, its sound and note changing with each letter, silent in her pauses.
   The pixel speaker by the typewriter mutes it all; the choice is remembered in this browser only.
   Browsers keep audio locked until the visitor's first press or key, so nothing can sound before that. */
(() => {
  const STORE = "koyak:muted";
  let muted = false;
  try { muted = localStorage.getItem(STORE) === "1"; } catch (_) {}

  let ctx = null, master = null, noise = null;
  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (_) { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); // keeps a burst of keys and the carriage from clipping together
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, ensure, { capture: true, passive: true });

  const live = () => ctx && !muted && ctx.state === "running";
  const rand = (a, b) => a + Math.random() * (b - a);

  // an envelope on a fresh gain: quick attack, exponential fall
  function env(t, peak, attack, decay, dest = master) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }
  // filtered noise: the clack, the snap, the ratchet
  function hiss(t, { type = "bandpass", freq = 2000, q = 1, gain = 0.3, attack = 0.001, decay = 0.03, to = null }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    src.connect(f).connect(env(t, gain, attack, decay));
    const off = Math.random() * 0.8;
    src.start(t, off, attack + decay + 0.02);
  }
  // a pitched body: the thunk of the typebar on the platen, the margin stop
  function tone(t, { type = "sine", freq = 200, to = null, gain = 0.3, attack = 0.002, decay = 0.05 }) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    o.connect(env(t, gain, attack, decay));
    o.start(t); o.stop(t + attack + decay + 0.02);
  }

  /* ---------- the typewriter ---------- */
  // one key: the slug hitting the paper (a bright clack and snap over a short wooden thunk), then the bar falling back
  function key({ delay = 0, gain = 1 } = {}) {
    if (!live()) return;
    const t = ctx.currentTime + delay / 1000, g = gain * rand(0.85, 1.1);
    hiss(t, { freq: rand(1900, 2900), q: 0.9, gain: 0.5 * g, decay: rand(0.028, 0.04) });
    hiss(t, { type: "highpass", freq: 5200, q: 0.7, gain: 0.22 * g, decay: 0.012 });
    tone(t, { freq: rand(170, 210), to: 85, gain: 0.42 * g, decay: 0.055 });
    tone(t, { type: "triangle", freq: rand(950, 1250), gain: 0.035 * g, decay: 0.06 }); // a little ring in the frame
    hiss(t + rand(0.05, 0.07), { freq: 1300, q: 1.2, gain: 0.1 * g, decay: 0.02 });  // the typebar dropping home
  }
  // the space bar: a broader, lower knock and the escapement stepping once
  function space({ gain = 1 } = {}) {
    if (!live()) return;
    const t = ctx.currentTime, g = gain * rand(0.85, 1.05);
    tone(t, { freq: rand(120, 140), to: 70, gain: 0.4 * g, decay: 0.07 });
    hiss(t, { freq: 900, q: 0.8, gain: 0.28 * g, decay: 0.035 });
    hiss(t + 0.012, { freq: 3600, q: 3, gain: 0.08 * g, decay: 0.008 });
  }
  // keys pressed at the margin: they go down but nothing strikes, so only a dull knock
  function jam() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, { freq: 150, to: 80, gain: 0.3, decay: 0.05 });
    hiss(t, { freq: 700, q: 1, gain: 0.15, decay: 0.03 });
  }
  // a stretch of noise whose loudness follows a curve (the carriage's speed as it is shoved home)
  function bed(t, dur, curve, { type = "bandpass", freq = 900, to = null, q = 0.8, gain = 0.1 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.value = 0; // (a curve may not share its start time with any other event)
    g.gain.setValueCurveAtTime(curve.map((v) => v * gain), t, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  // the carriage return of an old machine, thrown by hand: the lever clacks and ratchets the paper up a line,
  // then the whole carriage is dragged back along its rails, its pawl rasping over the rack's teeth, faster in
  // the middle of the shove, until it slams into the margin stop and rocks back a hair
  function carriage({ col = 24, cols = 24 } = {}) {
    if (!live()) return;
    const t = ctx.currentTime, travel = Math.min(1, col / cols);
    // the lever: line-space pawl, the platen turning a notch
    hiss(t, { freq: 1500, q: 1, gain: 0.3, decay: 0.03 });
    tone(t, { freq: 160, to: 90, gain: 0.28, decay: 0.05 });
    hiss(t + 0.04, { freq: 3400, q: 2.5, gain: 0.13, decay: 0.012 });
    hiss(t + 0.075, { freq: 2200, q: 2, gain: 0.08, decay: 0.01 });
    if (travel <= 0) return; // already at the margin: only the paper moves
    const start = t + 0.09, dur = 0.2 + 0.45 * travel, N = 64;
    // speed through the shove: picks up quickly, peaks past the middle, slows just before the stop
    const speed = Float32Array.from({ length: N }, (_, i) => Math.pow(Math.sin(Math.PI * Math.pow(i / (N - 1), 0.75)), 0.6));
    bed(start, dur, speed, { freq: 650, to: 1150, q: 0.9, gain: 0.11 });               // the drag: metal on metal
    bed(start, dur, speed, { type: "lowpass", freq: 220, q: 0.7, gain: 0.22 });          // the carriage rolling on its rails
    bed(start, dur, speed, { freq: 2600, to: 3400, q: 4, gain: 0.05 });                 // the rasp riding over it
    // the pawl over the rack: one tooth per column, the clicks crowding together where the carriage is fastest
    const teeth = Math.max(6, Math.round(col * 1.6));
    let acc = 0; const cum = [0];
    for (let i = 1; i < N; i++) cum.push(acc += speed[i] + 0.05);
    for (let n = 0; n < teeth; n++) {
      const target = (n / teeth) * acc;
      const i = cum.findIndex((c) => c >= target);
      const at = start + dur * Math.max(0, i) / (N - 1) + rand(-0.003, 0.003);
      hiss(at, { freq: rand(2400, 3900), q: 2.6, gain: rand(0.05, 0.1), decay: 0.006 });
    }
    // the margin stop, and the carriage rocking back off it
    const end = start + dur;
    tone(end, { freq: 120, to: 55, gain: 0.55, decay: 0.12 });
    hiss(end, { freq: 1000, q: 0.8, gain: 0.4, decay: 0.05 });
    hiss(end + 0.008, { type: "highpass", freq: 4500, gain: 0.12, decay: 0.02 });
    hiss(end + 0.07, { freq: 1400, q: 1.5, gain: 0.08, decay: 0.02 });
  }

  /* ---------- koyak.net's voice ---------- */
  // one unbroken line of babble for as long as she keeps typing. plate.js starts it when her mouth starts moving
  // (voiceStart), shapes it every time the mouth frame changes (voiceShape: louder wide open, softer half open,
  // a hum when the lips meet for a moment) and lets it fall silent only when she stops typing (voiceStop).
  // The typewriter tells her which letter she is on (say()): the vowel of the letter's name and its note glide in
  // without a break, and consonants with a puff of air or a stop add one, with a dip, as a syllable.
  const VOWELS = { // formants F1, F2 (Hz), for a light voice
    a: [850, 1610], e: [600, 2000], i: [320, 2750], o: [520, 920], u: [360, 880], y: [480, 2350], r: [740, 1250],
  };
  const SAYS = {
    a: "y", b: "i", c: "i", d: "i", e: "i", f: "e", g: "i", h: "y", i: "a", j: "y", k: "y", l: "e", m: "e",
    n: "e", o: "o", p: "i", q: "u", r: "r", s: "e", t: "i", u: "u", v: "i", w: "u", x: "e", y: "a", z: "i",
  };
  const PLOSIVE = /[bcdgkpqt]/, FRICATIVE = /[fhjsxz]/, NASAL = /[mnlrwvy]/;
  const BASE = 290; // Hz
  let phrase = 0; // drifts across a reply so the voice wanders a little, like intonation
  const now = { ch: "a", question: false };
  let vox = null; // the live voice: { src, lfo, f1, f2, artic, out }

  const pitchFor = (c, question) => {
    const step = ((c.charCodeAt(0) * 7) % 9) - 4; // the letter sets the note, so a word always sounds like itself
    phrase = phrase * 0.85 + rand(-1, 1) * 0.6;
    return BASE * Math.pow(2, (step * 0.5 + phrase + (question ? 3 : 0)) / 12);
  };
  function glide(c, question, tc = 0.03) {
    if (!vox) return;
    const t = ctx.currentTime, [a, b] = SAYS[c] ? VOWELS[SAYS[c]] : VOWELS.i;
    vox.src.frequency.setTargetAtTime(pitchFor(c, question), t, tc * 1.4);
    vox.f1.frequency.setTargetAtTime(a, t, tc);
    vox.f2.frequency.setTargetAtTime(b, t, tc);
  }

  function voiceStart() {
    if (!live() || vox) return;
    const t = ctx.currentTime;
    const src = ctx.createOscillator(); src.type = "sawtooth";
    src.frequency.setValueAtTime(pitchFor(now.ch, now.question), t);
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); // a little vibrato keeps it a voice, not a tone
    lfo.frequency.value = rand(5, 6); depth.gain.value = BASE * 0.012;
    lfo.connect(depth).connect(src.frequency);
    const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 3600; body.Q.value = 0.5;
    const artic = ctx.createGain(); artic.gain.value = 1;   // dips for consonants
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t); // follows the mouth
    src.connect(body);
    const [a, b] = SAYS[now.ch] ? VOWELS[SAYS[now.ch]] : VOWELS.i;
    const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = a; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = b; f2.Q.value = 6;
    const l1 = ctx.createGain(); l1.gain.value = 1.7; const l2 = ctx.createGain(); l2.gain.value = 1.1;
    const dry = ctx.createGain(); dry.gain.value = 0.18;
    body.connect(f1).connect(l1).connect(artic);
    body.connect(f2).connect(l2).connect(artic);
    body.connect(dry).connect(artic);
    artic.connect(out).connect(master);
    src.start(t); lfo.start(t);
    vox = { src, lfo, f1, f2, artic, out };
  }
  // the mouth frame plate.js has just put up: "wide", "half" or "shut" (lips touching for a beat: a soft hum)
  function voiceShape(open = "wide") {
    if (!vox) voiceStart();
    if (!vox) return;
    const level = open === "wide" ? 0.27 : open === "half" ? 0.19 : 0.05;
    vox.out.gain.setTargetAtTime(level, ctx.currentTime, 0.018);
  }
  function voiceStop() {
    if (!vox) return;
    const v = vox, t = ctx.currentTime;
    vox = null;
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0, t, 0.03);
    v.src.frequency.setTargetAtTime(v.src.frequency.value * 0.92, t, 0.05); // a small fall into the pause
    v.src.stop(t + 0.25); v.lfo.stop(t + 0.25);
  }
  // the letter her hands are on (spaces and punctuation keep the last sound)
  function say(ch, { question = false } = {}) {
    const c = String(ch).toLowerCase();
    now.question = question;
    if (!(SAYS[c] || /[0-9]/.test(c))) return;
    now.ch = c;
    if (!vox || !live()) return;
    const t = ctx.currentTime;
    glide(c, question);
    // consonants articulate: a stop closes the sound for an instant, a fricative breathes over it
    if (PLOSIVE.test(c) || FRICATIVE.test(c) || NASAL.test(c)) {
      const dip = PLOSIVE.test(c) ? 0.12 : NASAL.test(c) ? 0.5 : 0.3;
      vox.artic.gain.cancelScheduledValues(t);
      vox.artic.gain.setTargetAtTime(dip, t, 0.006);
      vox.artic.gain.setTargetAtTime(1, t + 0.025, 0.02);
    }
    if (PLOSIVE.test(c)) hiss(t + 0.02, { freq: 2500, q: 0.8, gain: 0.1, decay: 0.012 });
    else if (FRICATIVE.test(c)) hiss(t, { type: "highpass", freq: c === "h" ? 1800 : 4800, q: 0.7, gain: 0.06, attack: 0.004, decay: 0.035 });
  }

  /* ---------- mute ---------- */
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(STORE, muted ? "1" : "0"); } catch (_) {}
    if (ctx) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(muted ? 0 : 0.8, t, 0.03);
    }
    window.dispatchEvent(new CustomEvent("koyak:mute", { detail: { muted } }));
  }

  const btn = document.getElementById("mute");
  function show() {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(muted));
    btn.setAttribute("aria-label", muted ? "Sound is off. Turn sound on" : "Sound is on. Mute sound");
    btn.title = muted ? "sound off" : "sound on";
    btn.classList.toggle("is-muted", muted);
  }
  if (btn) {
    btn.addEventListener("click", () => { ensure(); setMuted(!muted); show(); if (!muted) key({ gain: 0.6 }); });
    show();
  }

  window.koyakSound = { key, space, jam, carriage, say, voiceStart, voiceShape, voiceStop, setMuted, get muted() { return muted; }, get ready() { return !!ctx; } };
})();
