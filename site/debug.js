/* TEMPORARY: a panel for running the story's scripted scenes while their slides are being drawn.
   Loaded by underside.js only on localhost; it shows itself only if the Worker lists scenes at
   /api/debug/cutscenes, which it does only with STORY_DEBUG=1 in .dev.vars. Nothing here talks to the visitor's
   saved state: scenes are played straight onto the page.
   To remove: delete this file, the hook at the end of underside.js, and debugCutscenes in worker/index.js. */
(async () => {
  let data;
  try {
    const r = await fetch("api/debug/cutscenes", { cache: "no-store" });
    if (!r.ok) return;
    data = await r.json();
  } catch (_) { return; }
  if (!data || !Array.isArray(data.cutscenes)) return; // not a debug server: stay out of the way
  const scenes = data.cutscenes;
  const tw = () => window.__typewriter;
  const paper = () => window.koyakPaper;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const css = document.createElement("style");
  css.textContent = `
  .dbg { position: fixed; left: 12px; bottom: 12px; z-index: 60; width: min(380px, calc(100vw - 24px)); max-height: 62vh;
    display: flex; flex-direction: column; font: 12px/1.35 var(--mono); color: var(--lilac);
    background: rgb(1 1 16 / .9); border: 1px solid rgb(174 178 242 / .35); box-shadow: 0 10px 40px rgb(0 0 0 / .6); }
  .dbg.is-min .dbg-body { display: none; }
  .dbg header { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid rgb(174 178 242 / .2); }
  .dbg header b { font-weight: 400; color: var(--paper); flex: 1; letter-spacing: .04em; }
  .dbg-body { overflow: auto; padding: 6px 10px 10px; }
  .dbg button { font: inherit; color: var(--paper); background: transparent; border: 1px solid rgb(174 178 242 / .4);
    padding: 2px 7px; cursor: pointer; }
  .dbg button:hover, .dbg button:focus-visible { background: rgb(174 178 242 / .16); outline: none; }
  .dbg button.is-on { background: var(--lilac); color: #010110; }
  .dbg-row { padding: 7px 0; border-bottom: 1px dashed rgb(174 178 242 / .16); }
  .dbg-row .id { color: var(--paper); margin-bottom: 4px; display: flex; justify-content: space-between; }
  .dbg-row .id i { font-style: normal; opacity: .55; }
  .dbg-row .acts, .dbg-row .chips, .dbg-tools { display: flex; flex-wrap: wrap; gap: 4px; }
  .dbg-row .chips { margin-top: 4px; }
  .dbg-row .chips button { padding: 1px 5px; font-size: 11px; opacity: .85; }
  .dbg-tools { padding: 8px 0 4px; align-items: center; }
  .dbg-tools label { display: flex; gap: 4px; align-items: center; margin-left: auto; }
  .dbg-status { min-height: 2.7em; margin-top: 6px; color: var(--paper); opacity: .8; white-space: pre-wrap; }
  .dbg-thumb { display: block; width: 100%; aspect-ratio: 16 / 10; margin-top: 6px; background: #000; object-fit: cover; }
  .dbg-thumb[hidden] { display: none; }`;
  document.head.appendChild(css);

  const el = document.createElement("section");
  el.className = "dbg";
  el.setAttribute("aria-label", "Cutscene debug panel (local only)");
  el.innerHTML = `<header><b>cutscenes · local debug</b><button type="button" data-min aria-label="Minimise">–</button></header>
    <div class="dbg-body">
      <div class="dbg-tools">
        <button type="button" data-stop>stop + clear</button>
        <button type="button" data-reload>reload</button>
        <label><input type="checkbox" data-raw> raw svg</label>
      </div>
      <div class="dbg-list"></div>
      <img class="dbg-thumb" alt="" hidden>
      <div class="dbg-status" aria-live="polite">play: her typing and the scene, as a visitor sees it.
visuals: the scene alone, lines shown here. 1 2 3: hold one slide (* marks a flash).</div>
    </div>`;
  document.body.appendChild(el);
  const list = el.querySelector(".dbg-list"), status = el.querySelector(".dbg-status"), thumb = el.querySelector(".dbg-thumb");
  const raw = el.querySelector("[data-raw]");
  const say = (t) => { status.textContent = t; };
  // keep keys typed in the panel away from the typewriter
  el.addEventListener("keydown", (e) => e.stopPropagation());

  let token = 0; // bumped to stop a visuals run between steps
  const slidesOf = (s) => s.steps.filter((st) => st.fx && (st.fx.t === "slide" || st.fx.t === "flash")).map((st) => st.fx);
  const describe = (st) => st.say ? "“" + st.say + "”" : st.type ? "“" + st.type + "”" : st.pause ? "pause " + st.pause
    : st.erase ? "erase " + st.erase : st.fx ? "fx " + st.fx.t + (st.fx.id ? " " + st.fx.id : st.fx.to != null ? " → " + st.fx.to : "") : "?";

  async function visuals(s) {
    const mine = ++token;
    for (const st of s.steps) if (st.fx && (st.fx.t === "slide" || st.fx.t === "flash")) window.koyakBackdrop?.preload(st.fx);
    for (let i = 0; i < s.steps.length; i++) {
      if (mine !== token) return;
      const st = s.steps[i];
      say(`${s.id}  ${i + 1}/${s.steps.length}\n${describe(st)}`);
      if (st.say || st.type) await wait(Math.min(9000, 900 + (st.say || st.type).length * 38)); // about her typing speed
      else if (st.pause) await wait(st.pause);
      else if (st.fx && st.fx.t === "swap") await tw()?.say([{ fx: st.fx }]);
      else if (st.fx && st.fx.t !== "plane") await paper()?.fx(st.fx);
    }
    if (mine === token) say(`${s.id}: done`);
  }
  async function play(s) {
    token++;
    if (!tw()) return say("the typewriter isn't ready yet");
    if (tw().turn !== "you") say("waiting for her to finish typing…");
    say(`${s.id}: playing on the typewriter (reload to stop it mid-line)`);
    await tw().say(s.steps.filter((st) => !(st.fx && st.fx.t === "plane")), { mode: "scene" });
    say(`${s.id}: done`);
  }
  async function hold(s, f, n) {
    token++;
    say(`${s.id}  slide ${n}: ${f.id || ""}\ndrift ${f.drift || "in"} · focus ${(f.focus || []).join(", ")}${f.shake ? " · shake " + f.shake : ""}`);
    if (raw.checked) { thumb.hidden = false; thumb.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.svg); }
    await window.koyakBackdrop?.slide({ ...f, t: "slide", ms: 500, sting: false });
  }
  async function stop() {
    token++;
    thumb.hidden = true;
    await Promise.all([paper()?.fx({ t: "clear", ms: 500 }), tw()?.swapped ? tw().say([{ fx: { t: "swap", on: false } }]) : null]);
    say("cleared");
  }

  for (const s of scenes) {
    const row = document.createElement("div");
    row.className = "dbg-row";
    const slides = slidesOf(s);
    row.innerHTML = `<div class="id"><span></span><i></i></div><div class="acts"><button type="button" data-play>play</button><button type="button" data-vis>visuals</button></div><div class="chips"></div>`;
    row.querySelector(".id span").textContent = s.id;
    row.querySelector(".id i").textContent = `${s.kind} · ${slides.length} slide${slides.length === 1 ? "" : "s"}`;
    row.querySelector("[data-play]").addEventListener("click", () => play(s));
    row.querySelector("[data-vis]").addEventListener("click", () => visuals(s));
    const chips = row.querySelector(".chips");
    slides.forEach((f, i) => {
      const b = document.createElement("button");
      // A flash is held here like any slide so its artwork can be inspected.
      const flashLabel = f.flickerMs ? " (flicker)" : f.t === "flash" ? " (one-frame flash)" : "";
      b.type = "button"; b.textContent = String(i + 1) + (f.t === "flash" ? "*" : ""); b.title = (f.id || "slide " + (i + 1)) + flashLabel;
      b.addEventListener("click", () => hold(s, f, i + 1));
      chips.appendChild(b);
    });
    list.appendChild(row);
  }
  if (!scenes.length) say("the Worker has no scenes to show (is the story pack opening?)");
  el.querySelector("[data-stop]").addEventListener("click", stop);
  el.querySelector("[data-reload]").addEventListener("click", () => location.reload());
  el.querySelector("[data-min]").addEventListener("click", () => el.classList.toggle("is-min"));
  raw.addEventListener("change", () => { if (!raw.checked) thumb.hidden = true; });
})();
