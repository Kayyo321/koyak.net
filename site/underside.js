/* Under the page. The site is one screen, but if you keep going past the bottom of it (a few more turns of the
   wheel, a long swipe up, the down key a few times, or Tab past the last control), it gives a little, and
   then lifts to show the floor underneath, where folded paper collects.
   Everything about what is on the paper comes from the server, one face at a time, when it is turned to:
   POST api/hello (what is here for this visitor), POST api/paper { op: unfold | turn | light, id }.
   The server also sends small scripts for the typewriter; their page effects (fx) are performed here. */
(() => {
  const root = document.documentElement;
  const stage = document.querySelector(".stage");
  const under = document.getElementById("underside");
  const shelf = under && under.querySelector(".shelf");
  const room = document.getElementById("sheet-room");
  const fxLayer = document.getElementById("fx");
  if (!stage || !under || !shelf || !room || !fxLayer) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const sound = () => window.koyakSound;
  const tw = () => window.__typewriter;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = { on: false, open: false, lift: 0, planes: [], pending: null, sheet: null };

  async function post(path, body) {
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) { return null; }
  }

  /* ---------- lifting the page ---------- */
  const depth = () => under.getBoundingClientRect().height;
  function lift(px, ms = 380) {
    state.lift = Math.max(0, px);
    root.style.setProperty("--lift-ms", (reduce.matches ? 0 : ms) + "ms");
    root.style.setProperty("--lift", state.lift + "px");
    moved();
  }
  // the page slides under a cursor that may not be moving: the pointer's loupe (pointer.js) follows it until the slide ends
  const moved = () => window.dispatchEvent(new Event("koyak:lift"));
  function openUnder(why) {
    if (!state.on) return;
    state.open = true; pull = 0;
    root.dataset.under = "open";
    lift(depth(), why === "peek" ? 300 : 620);
  }
  function closeUnder() {
    if (!state.open && !state.lift) return;
    state.open = false; pull = 0;
    delete root.dataset.under;
    lift(0, 520);
    // nothing on the floor keeps focus once it is covered: a fold left focused would catch the next Space
    // (typed for the typewriter) and open its sheet again
    if (under.contains(document.activeElement)) document.activeElement.blur();
    // a story that was waiting for the page to settle can begin now
    if (state.pending && !root.dataset.paper) { const p = state.pending; state.pending = null; setTimeout(() => tw()?.say(p.steps, { mode: p.mode }), reduce.matches ? 0 : 560); }
  }
  // resistance: the page gives a few pixels, then a little more, then lets go
  // the pull leaks away with time (half of it in under two seconds), so only a deliberate, sustained scroll gets there
  let pull = 0, pulledAt = 0, slack = 0;
  const give = (p) => Math.min(42, 42 * (1 - Math.exp(-p / 260)));
  function tug(amount) {
    if (!state.on || state.open || !room.hidden) return;
    const now = performance.now();
    pull = pull * Math.exp(-(now - pulledAt) / 2500) + amount;
    pulledAt = now;
    lift(give(pull), 120);
    clearTimeout(slack);
    if (pull > 560) { openUnder(); return; }
    slack = setTimeout(() => { pull = 0; if (!state.open) lift(0, 420); }, 900);
  }

  window.addEventListener("wheel", (e) => {
    if (!state.on || !room.hidden) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (state.open) { if (dy < -4) closeUnder(); return; }
    if (dy > 0) tug(Math.min(dy, 140));
  }, { passive: true });

  let touch = null;
  window.addEventListener("touchstart", (e) => {
    if (!state.on || !room.hidden || e.touches.length !== 1) { touch = null; return; }
    touch = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now() };
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (!touch) return;
    const dy = touch.y - e.touches[0].clientY, dx = Math.abs(touch.x - e.touches[0].clientX);
    if (dx > Math.abs(dy)) return;
    if (!state.open && dy > 12) lift(give(dy * 2.1), 0);
    if (state.open && dy < -12) lift(depth() + dy * 0.6, 0);
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dy = touch.y - (e.changedTouches[0]?.clientY ?? touch.y);
    touch = null;
    if (!state.open) { if (dy > 150) openUnder(); else if (state.lift) lift(0, 420); }
    else if (dy < -60) closeUnder(); else lift(depth(), 300);
  }, { passive: true });

  let keyPulls = 0, keyTimer = 0;
  window.addEventListener("keydown", (e) => {
    if (!state.on || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!room.hidden) return; // the sheet has its own keys
    if (["ArrowDown", "PageDown", "End"].includes(e.key)) {
      if (state.open) return;
      keyPulls++;
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => { keyPulls = 0; if (!state.open) lift(0, 420); }, 1400);
      if (keyPulls >= 3) { keyPulls = 0; openUnder(); } else lift(give(keyPulls * 180), 160);
    } else if (["ArrowUp", "PageUp", "Home", "Escape"].includes(e.key) && state.open) {
      closeUnder();
      if (under.contains(document.activeElement)) document.getElementById("writer-send")?.focus({ preventScroll: true });
    }
  });
  // Tab past the last control lands on the floor: the page lifts to show where focus went
  under.addEventListener("focusin", () => { if (!state.open) openUnder(); });
  // and tabbing away puts it back; a press elsewhere is left to its click (moving the page mid-press loses the click)
  let pressing = false;
  window.addEventListener("pointerdown", () => { pressing = true; }, true);
  window.addEventListener("pointerup", () => setTimeout(() => { pressing = false; }, 0), true);
  under.addEventListener("focusout", (e) => {
    if (pressing || under.contains(e.relatedTarget) || !room.hidden || e.relatedTarget?.closest?.("#sheet-room")) return;
    closeUnder();
  });
  // touching the page itself puts it back down (after the click has done whatever it was for, like sending),
  // and so does starting to type: the typewriter is up there
  stage.addEventListener("click", () => { if (state.open && room.hidden) closeUnder(); });
  window.addEventListener("keydown", (e) => {
    if (state.open && room.hidden && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") closeUnder();
  });

  /* ---------- the floor: folded planes ---------- */
  const seed = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
  const label = (p) => (p.kind === "origin" ? (p.opened ? "The first paper plane, folded" : "A small folded paper plane") : `A folded paper plane, the ${ordinal(p.n)} one`);
  const ordinal = (n) => ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][n - 1] || n + "th";
  function render(planes, fresh) {
    state.planes = planes;
    const have = new Set([...shelf.children].map((b) => b.dataset.id));
    planes.forEach((p, i) => {
      let b = shelf.querySelector(`[data-id="${p.id}"]`);
      if (!b) {
        b = document.createElement("button");
        b.type = "button"; b.className = "fold"; b.dataset.id = p.id; b.dataset.kind = p.kind;
        b.setAttribute("role", "listitem");
        const r = seed(p.id);
        b.style.setProperty("--tip", (r * 26 - 13).toFixed(1) + "deg");
        b.style.setProperty("--rise", (seed(p.id + "y") * 14 - 7).toFixed(1) + "px");
        b.innerHTML = '<span class="fold-ink" aria-hidden="true"></span>';
        b.addEventListener("click", () => unfold(p.id, b));
        shelf.appendChild(b);
        if (fresh === p.id && !reduce.matches) { b.classList.add("is-landing"); setTimeout(() => b.classList.remove("is-landing"), 1400); }
      }
      b.setAttribute("aria-label", label(p));
      b.style.order = String(i);
      have.delete(p.id);
    });
    for (const id of have) shelf.querySelector(`[data-id="${id}"]`)?.remove();
    under.classList.toggle("has-many", planes.length > 1);
  }

  /* ---------- a sheet in the hands ---------- */
  const sheetEl = room.querySelector(".sheet");
  const faces = { front: room.querySelector(".face-front"), back: room.querySelector(".face-back"), light: room.querySelector(".face-light") };
  const cornerBtn = room.querySelector(".corner");
  const foldBtn = room.querySelector(".fold-up");
  const status = room.querySelector(".sheet-status");
  let returnFocus = null;

  function linesInto(el, lines, { note } = {}) {
    el.textContent = "";
    for (const l of lines || []) {
      const p = document.createElement("p");
      p.className = "hand hand-" + (l.hand || "type");
      p.textContent = l.t;
      el.appendChild(p);
    }
    if (note) {
      // for whoever reads the markup: a hint, and an action they can take with it
      el.appendChild(document.createComment(" " + note + " "));
      el.dataset.note = note;
    } else delete el.dataset.note;
  }
  function showFace(face) {
    sheetEl.dataset.face = face;
    sheetEl.setAttribute("aria-pressed", String(face === "light"));
    cornerBtn.setAttribute("aria-label", face === "back" ? "Turn the sheet back over" : "Turn the sheet over");
    status.textContent = face === "back" ? "The back of the sheet." : face === "light" ? "The sheet, held up to the light." : "The front of the sheet.";
  }
  async function getFace(face) {
    const s = state.sheet;
    if (s.faces[face]) return s.faces[face];
    const r = await post("api/paper", { op: face === "back" ? "turn" : "light", id: s.id });
    if (!r || !r.sheet) return null;
    s.faces[face] = r.sheet;
    if (face === "back") linesInto(faces.back, r.sheet.lines);
    else {
      faces.light.textContent = "";
      const through = document.createElement("div"); through.className = "through";
      linesInto(through, r.sheet.mirror);
      const top = document.createElement("div"); top.className = "on-top";
      linesInto(top, r.sheet.lines);
      faces.light.append(through, top);
      if (r.sheet.impression) {
        const imp = document.createElement("p"); imp.className = "impression"; imp.textContent = r.sheet.impression;
        faces.light.appendChild(imp);
      }
    }
    sheetEl.classList.toggle("is-faint", !!r.sheet.faint);
    return r.sheet;
  }
  async function turnOver() {
    if (!state.sheet) return;
    const to = sheetEl.dataset.face === "back" ? "front" : "back";
    if (to === "back" && !(await getFace("back"))) return;
    sound()?.paper({ gain: 0.8 });
    if (reduce.matches) { showFace(to); return; }
    sheetEl.classList.add("is-turning");
    await wait(170);
    showFace(to);
    sheetEl.classList.remove("is-turning");
  }
  async function holdUp() {
    if (!state.sheet) return;
    if (sheetEl.dataset.face === "light") { showFace("front"); return; }
    if (!(await getFace("light"))) return;
    sound()?.paper({ gain: 0.4 });
    showFace("light");
  }
  async function unfold(id, from) {
    const r = await post("api/paper", { op: "unfold", id });
    if (!r || !r.sheet) return;
    sound()?.paper();
    returnFocus = from || null;
    state.sheet = { id, faces: { front: r.sheet } };
    linesInto(faces.front, r.sheet.lines, { note: r.sheet.note });
    faces.back.textContent = ""; faces.light.textContent = "";
    sheetEl.classList.remove("is-faint");
    sheetEl.dataset.kind = shelf.querySelector(`[data-id="${id}"]`)?.dataset.kind || "";
    showFace("front");
    room.hidden = false;
    root.dataset.paper = "open";
    requestAnimationFrame(() => room.classList.add("is-open"));
    sheetEl.focus({ preventScroll: true });
    if (r.planes) render(r.planes);
    if (r.steps && r.steps.length) state.pending = { steps: r.steps, mode: r.mode };
  }
  function foldUp() {
    if (room.hidden) return;
    sound()?.paper({ gain: 0.6 });
    room.classList.remove("is-open");
    delete root.dataset.paper;
    state.sheet = null;
    setTimeout(() => { room.hidden = true; }, reduce.matches ? 0 : 260);
    if (state.pending) { closeUnder(); document.activeElement?.blur?.(); } // the story starts once the page is back where it was
    else if (returnFocus) returnFocus.focus({ preventScroll: true });
  }
  sheetEl.addEventListener("click", (e) => { if (!e.target.closest("button")) holdUp(); });
  sheetEl.addEventListener("keydown", (e) => { if (e.target === sheetEl && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); holdUp(); } });
  cornerBtn.addEventListener("click", (e) => { e.stopPropagation(); turnOver(); });
  foldBtn.addEventListener("click", foldUp);
  room.addEventListener("click", (e) => { if (e.target === room) foldUp(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !room.hidden) { e.preventDefault(); foldUp(); } });
  room.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { // keep focus on the paper while it is in the hands
      const f = [sheetEl, cornerBtn, foldBtn];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
  });

  /* ---------- effects the server asks for ---------- */
  const dimEl = fxLayer.querySelector(".fx-dim");
  function fade(el, to, ms) { el.style.transition = `opacity ${reduce.matches ? 0 : ms}ms ease`; el.style.opacity = String(to); }
  async function fx(f) {
    switch (f.t) {
      case "dim": fade(dimEl, f.to ?? 1, f.ms ?? 1000); await wait(reduce.matches ? 0 : f.ms ?? 1000); return;
      case "tilt":
        if (!reduce.matches) { root.style.setProperty("--lift-ms", (f.ms ?? 1200) + "ms"); root.style.setProperty("--tilt", (f.deg ?? 0) + "deg"); moved(); await wait(f.ms ?? 1200); }
        return;
      case "overlay": {
        const art = document.createElement("div");
        art.className = "fx-art fx-" + (f.mode === "vignette" ? "vignette" : "cover");
        art.dataset.art = f.id || "";
        art.innerHTML = f.svg || ""; // the server's own drawing, earned by this point in the story
        art.style.opacity = "0";
        fxLayer.appendChild(art);
        requestAnimationFrame(() => fade(art, 1, f.ms ?? 900));
        await wait(reduce.matches ? 0 : Math.min(f.ms ?? 900, 1200));
        return;
      }
      case "clear": {
        const ms = f.ms ?? 1200;
        fade(dimEl, 0, ms);
        for (const a of fxLayer.querySelectorAll(".fx-art")) { fade(a, 0, ms); setTimeout(() => a.remove(), (reduce.matches ? 0 : ms) + 50); }
        root.style.setProperty("--lift-ms", (reduce.matches ? 0 : ms) + "ms"); root.style.setProperty("--tilt", "0deg"); moved();
        await wait(reduce.matches ? 0 : ms);
        return;
      }
      case "face":
        window.dispatchEvent(new CustomEvent("koyak:face", { detail: { cue: f.cue, ms: f.ms } }));
        await wait(f.ms ?? 2000);
        return;
      case "plane": {
        const list = state.planes.filter((p) => p.id !== f.plane.id).concat([f.plane]);
        state.on = true;
        sound()?.paper({ gain: 0.7 });
        render(list, f.plane.id);
        if (!state.open) {
          openUnder("peek");
          await wait(reduce.matches ? 900 : 1700);
          closeUnder();
          await wait(reduce.matches ? 0 : 500);
        }
        return;
      }
      case "nudge": // the page gives, twice, as if someone underneath had tapped it
        if (!state.on || state.open) return;
        for (let i = 0; i < 2; i++) { lift(22, 160); await wait(reduce.matches ? 200 : 220); lift(0, 360); await wait(reduce.matches ? 100 : 380); }
        return;
    }
  }
  window.koyakPaper = { fx, open: openUnder, close: closeUnder, get isOpen() { return state.open; } };

  window.addEventListener("koyak:story", (e) => { if (e.detail && e.detail.planes) { state.on = true; render(e.detail.planes); } });

  /* ---------- what is here for this visitor ---------- */
  post("api/hello").then(async (h) => {
    if (!h || !h.arg) return;
    state.on = true;
    under.hidden = false;
    render(h.planes || []);
    if (!h.steps || !h.steps.length) return;
    await (tw()?.ready || Promise.resolve());
    await wait(reduce.matches ? 300 : 2200); // let the page develop first
    if (tw() && !tw().typing && tw().turn === "you") tw().say(h.steps, { mode: h.mode });
  });
})();
