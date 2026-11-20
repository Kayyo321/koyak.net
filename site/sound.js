/* The room's sound, all synthesized (no samples to load): the typewriter's strike, its space bar and carriage
   return (bell near the margin, the carriage ratcheting home, the stop), and koyak.net's voice while it
   types, a little babble of vowel blips, one per letter, pitched by the letter.
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
    const comp = ctx.createDynamicsCompressor(); // keeps a burst of keys and a bell from clipping together
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
  // a pitched body: the thunk of the typebar on the platen, the bell
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
  // the carriage return: the bell if the line ran close to the margin, the lever feeding the paper up a line,
  // the carriage sliding home over its ratchet (one tooth per column it travels) and hitting the stop
  function carriage({ col = 24, cols = 24 } = {}) {
    if (!live()) return;
    const t = ctx.currentTime, travel = Math.min(1, col / cols);
    if (col >= cols * 0.6) {
      const f = rand(2290, 2380);
      tone(t, { freq: f, gain: 0.16, attack: 0.002, decay: 1.5 });
      tone(t, { freq: f * 2.76, gain: 0.05, attack: 0.002, decay: 0.6 });
      tone(t, { freq: f * 5.4, gain: 0.02, attack: 0.001, decay: 0.25 });
    }
    const t1 = t + 0.06;
    hiss(t1, { freq: 1500, q: 1, gain: 0.32, decay: 0.03 });
    tone(t1, { freq: 160, to: 90, gain: 0.3, decay: 0.05 });
    hiss(t1 + 0.035, { freq: 3800, q: 2.5, gain: 0.14, decay: 0.01 });
    if (travel <= 0) return;
    const dur = 0.1 + 0.3 * travel, start = t1 + 0.07;
    hiss(start, { freq: 700, q: 0.7, gain: 0.06, attack: 0.03, decay: dur, to: 1700 }); // the slide
    const teeth = Math.max(3, Math.round(col));
    for (let i = 0; i < teeth; i++) {
      const k = i / teeth;
      const at = start + dur * (1 - Math.pow(1 - k, 1.6)); // quick at first, easing into the stop
      hiss(at, { freq: rand(3000, 4300), q: 2.2, gain: rand(0.07, 0.12), decay: 0.006 });
    }
    const end = start + dur;
    tone(end, { freq: 115, to: 55, gain: 0.5, decay: 0.1 });
    hiss(end, { freq: 1000, q: 0.8, gain: 0.38, decay: 0.05 });
    hiss(end + 0.01, { type: "highpass", freq: 4500, gain: 0.12, decay: 0.02 });
  }

  /* ---------- koyak.net's voice ---------- */
  // she only makes a sound while her lips are apart: plate.js calls voice() each time her mouth opens, for as long
  // as it stays open. The typewriter only tells her which letter she is on (say()), which sets the syllable:
  // each letter is babbled as the vowel of its name, with a puff of air for the consonants that have one
  const VOWELS = { // formants F1, F2 (Hz), for a light voice
    a: [850, 1610], e: [600, 2000], i: [320, 2750], o: [520, 920], u: [360, 880], y: [480, 2350], r: [740, 1250],
  };
  const SAYS = {
    a: "y", b: "i", c: "i", d: "i", e: "i", f: "e", g: "i", h: "y", i: "a", j: "y", k: "y", l: "e", m: "e",
    n: "e", o: "o", p: "i", q: "u", r: "r", s: "e", t: "i", u: "u", v: "i", w: "u", x: "e", y: "a", z: "i",
  };
  const PLOSIVE = /[bcdgkpqt]/, FRICATIVE = /[fhjsxz]/;
  let phrase = 0; // drifts across a reply so the voice wanders a little, like intonation
  const now = { ch: "a", question: false, fresh: false };
  // the letter her hands are on (spaces and punctuation keep the last sound)
  function say(ch, { question = false } = {}) {
    const c = String(ch).toLowerCase();
    if (SAYS[c] || /[0-9]/.test(c)) { now.ch = c; now.fresh = true; }
    now.question = question;
  }

  // one syllable, as long as the mouth frame that carries it; wide open is a little louder than half open
  function voice({ ms = 70, wide = true } = {}) {
    if (!live()) return;
    const c = now.ch, question = now.question, fresh = now.fresh;
    now.fresh = false;
    const formant = SAYS[c] ? VOWELS[SAYS[c]] : VOWELS.i;
    const t = ctx.currentTime;
    // the letter sets the note (so a word always sounds like itself), the moment adds the rest
    const step = ((c.charCodeAt(0) * 7) % 9) - 4;
    phrase = phrase * 0.85 + rand(-1, 1) * 0.6;
    const semis = step * 0.55 + phrase + (question ? 3 : 0) + rand(-0.4, 0.4);
    const f0 = 300 * Math.pow(2, semis / 12);
    const dur = Math.min(0.16, Math.max(0.045, ms / 1000 - 0.012));

    const out = env(t, wide ? 0.28 : 0.19, 0.008, dur);
    const src = ctx.createOscillator();
    src.type = "sawtooth";
    src.frequency.setValueAtTime(f0 * 1.04, t);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.94, t + dur); // a small fall on every syllable
    const body = ctx.createBiquadFilter(); // soften the buzz
    body.type = "lowpass"; body.frequency.value = 3600; body.Q.value = 0.5;
    src.connect(body);
    for (const [i, f] of formant.entries()) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6;
      const lvl = ctx.createGain(); lvl.gain.value = i === 0 ? 1.7 : 1.1;
      body.connect(bp).connect(lvl).connect(out);
    }
    const dry = ctx.createGain(); dry.gain.value = 0.18;
    body.connect(dry).connect(out);
    src.start(t); src.stop(t + dur + 0.05);
    if (!fresh) return; // a held vowel: no second consonant
    if (PLOSIVE.test(c)) hiss(t, { freq: 2500, q: 0.8, gain: 0.12, decay: 0.012 });
    else if (FRICATIVE.test(c)) hiss(t, { type: "highpass", freq: c === "h" ? 1800 : 4800, q: 0.7, gain: 0.07, attack: 0.004, decay: 0.03 });
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

  window.koyakSound = { key, space, jam, carriage, say, voice, setMuted, get muted() { return muted; }, get ready() { return !!ctx; } };
})();
