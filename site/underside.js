/* Under the page. The site is one screen, but if you take hold of its bottom edge and drag it up (or swipe up
   from the very bottom, press the down key a few times, or Tab past the last control), it gives, and then
   lifts to show the floor underneath, where folded paper collects. The wheel is the typewriter's: it scrolls
   the sheet. Until the floor has been found once, nothing at the bottom edge says it can be held.
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
  // found: the visitor has pulled the floor up before (remembered in this browser). Until then the bottom
  // edge keeps the idle cursor until the visitor finds it (pointer.js)
  const FOUND = "koyak.floor.found";
  let found = false;
  try { found = localStorage.getItem(FOUND) === "1"; } catch (_) {}
  const showFound = () => { if (found) root.dataset.floorFound = "1"; };
  showFound();

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
    state.open = true;
    root.dataset.under = "open";
    if (why !== "peek" && !found) { found = true; try { localStorage.setItem(FOUND, "1"); } catch (_) {} showFound(); }
    lift(depth(), why === "peek" ? 300 : 620);
  }
  function closeUnder() {
    if (!state.open && !state.lift) return;
    state.open = false;
    delete root.dataset.under;
    lift(0, 520);
    // nothing on the floor keeps focus once it is covered: a fold left focused would catch the next Space
    // (typed for the typewriter) and open its sheet again
    if (under.contains(document.activeElement)) document.activeElement.blur();
    // a story that was waiting for the page to settle can begin now
    if (state.pending && !root.dataset.paper) { const p = state.pending; state.pending = null; setTimeout(() => tw()?.say(p.steps, { mode: p.mode }), reduce.matches ? 0 : 560); }
  }
  // resistance before the page lets go: it follows the hand at first, then stiffens
  const give = (p) => Math.min(42, 42 * (1 - Math.exp(-p / 260)));
  const follow = (dy) => { const d = depth(); return dy <= 0 ? 0 : dy < d ? dy * 0.85 : d * 0.85 + (dy - d) * 0.15; };
  const enough = () => Math.min(140, depth() * 0.4); // how far the edge must be pulled before the page goes all the way

  // once it is up, the wheel (either way) or a drag down puts it back
  window.addEventListener("wheel", (e) => {
    if (!state.open || !room.hidden) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (dy < -4) closeUnder();
  }, { passive: true });

  // the bottom edge you can take hold of with a mouse or pen (touch has its own swipe, below)
  const edge = document.createElement("div");
  edge.className = "pull-edge"; edge.setAttribute("aria-hidden", "true"); edge.hidden = true;
  document.body.appendChild(edge);
  let drag = null; // { id, y, from: "edge" | "floor", moved }
  edge.addEventListener("pointerdown", (e) => {
    if (!state.on || state.open || !room.hidden || e.button !== 0) return;
    drag = { id: e.pointerId, y: e.clientY, from: "edge" };
    edge.setPointerCapture(e.pointerId); root.dataset.dragging = "1";
    e.preventDefault();
  });
  // once it is up, the floor or the lifted page can be dragged back down (a plain click on the page still closes it)
  window.addEventListener("pointerdown", (e) => {
    if (!state.open || !room.hidden || e.button !== 0 || e.pointerType === "touch") return;
    if (e.target.closest && e.target.closest("button, a, #writer-canvas, #sheet-room")) return;
    drag = { id: e.pointerId, y: e.clientY, from: "floor", page: stage.contains(e.target) };
    under.setPointerCapture(e.pointerId); root.dataset.dragging = "1";
    e.preventDefault();
  });
  const dragMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y - e.clientY; // up is positive
    if (drag.from === "edge") lift(follow(dy), 0);
    else lift(Math.max(0, depth() + Math.min(0, dy)), 0);
  };
  const dragEnd = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y - e.clientY, { from, page } = drag;
    drag = null; delete root.dataset.dragging;
    if (from === "edge") { if (dy > enough()) openUnder("drag"); else lift(0, 420); }
    else if (dy < -60 || (page && Math.abs(dy) < 6)) closeUnder(); else lift(depth(), 300); // a plain click on the page puts it back too
  };
  for (const el of [edge, under]) {
    el.addEventListener("pointermove", dragMove);
    el.addEventListener("pointerup", dragEnd);
    el.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.id) { drag = null; delete root.dataset.dragging; lift(state.open ? depth() : 0, 300); } });
  }

  // touch: a swipe up that starts at the very bottom of the screen; once open, a swipe down anywhere
  const TOUCH_EDGE = 64;
  let touch = null;
  window.addEventListener("touchstart", (e) => {
    touch = null; delete root.dataset.pulling;
    if (!state.on || !room.hidden || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!state.open && t.clientY < innerHeight - TOUCH_EDGE) return;
    touch = { y: t.clientY, x: t.clientX };
    if (!state.open) root.dataset.pulling = "1"; // the typewriter leaves this swipe alone
  }, { passive: true, capture: true });
  window.addEventListener("touchmove", (e) => {
    if (!touch) return;
    const dy = touch.y - e.touches[0].clientY, dx = Math.abs(touch.x - e.touches[0].clientX);
    if (dx > Math.abs(dy)) return;
    if (!state.open && dy > 8) lift(follow(dy), 0);
    if (state.open && dy < -12) lift(depth() + dy * 0.6, 0);
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dy = touch.y - (e.changedTouches[0]?.clientY ?? touch.y);
    touch = null; delete root.dataset.pulling;
    if (!state.open) { if (dy > enough()) openUnder("drag"); else if (state.lift) lift(0, 420); }
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
  let cursor = null, shiftHeld = false, touchId = null;
  let beam = null, beamFrame = 0, triedLight = false;

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
    if (face === "back") faces.back.scrollTop = state.sheet.backScroll;
    cornerBtn.setAttribute("aria-label", face === "back" ? "Turn the sheet back over" : "Turn the sheet over");
    status.textContent = face === "back" ? "The back of the sheet." : "The front of the sheet.";
    updateFlashlight();
  }
  function getFace(s, face) {
    return s.requests[face] ??= loadFace(s, face);
  }
  async function loadFace(s, face) {
    const r = await post("api/paper", { op: face === "back" ? "turn" : "light", id: s.id });
    if (!r?.sheet) { delete s.requests[face]; return null; }
    if (state.sheet !== s) return null;
    if (face === "back") linesInto(faces.back, r.sheet.lines);
    else {
      const ink = document.createElement("div"); ink.className = "light-ink";
      const through = document.createElement("div"); through.className = "face through";
      linesInto(through, r.sheet.mirror);
      const top = document.createElement("div"); top.className = "on-top"; top.setAttribute("aria-hidden", "true");
      linesInto(top, r.sheet.lines);
      ink.appendChild(top);
      if (r.sheet.impression) {
        const imp = document.createElement("p"); imp.className = "impression"; imp.textContent = r.sheet.impression;
        ink.appendChild(imp);
      }
      faces.light.replaceChildren(through, ink);
      through.scrollTop = s.backScroll;
    }
    return r.sheet;
  }
  async function turnOver() {
    const s = state.sheet;
    if (!s || s.turning) return;
    s.turning = true;
    const to = sheetEl.dataset.face === "back" ? "front" : "back";
    if (to === "back" && !(await getFace(s, "back"))) { s.turning = false; return; }
    if (state.sheet !== s) return;
    sound()?.paper({ gain: 0.8 });
    if (!reduce.matches) {
      sheetEl.classList.add("is-turning");
      await wait(170);
    }
    if (state.sheet !== s) return;
    if (to === "front") s.backScroll = faces.back.scrollTop;
    showFace(to);
    sheetEl.classList.remove("is-turning");
    s.turning = false;
  }

  function placeBeam(el, x, y) {
    el.style.setProperty("--beam-x", `${x.toFixed(2)}px`);
    el.style.setProperty("--beam-y", `${y.toFixed(2)}px`);
  }
  function drawFlashlight(now) {
    const rect = sheetEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const target = cursor ?? { x: cx, y: cy };
    const follow = beam && !reduce.matches ? 1 - Math.exp(-(now - beam.time) / 48) : 1;
    const x = beam ? beam.x + (target.x - beam.x) * follow : target.x;
    const y = beam ? beam.y + (target.y - beam.y) * follow : target.y;
    beam = { x, y, time: now };

    // The beam stays in screen space as the sheet rotates beneath it.
    const { clientWidth: width, clientHeight: height } = sheetEl;
    const inverse = new DOMMatrixReadOnly(getComputedStyle(sheetEl).transform).inverse();
    const point = inverse.transformPoint({ x: x - cx, y: y - cy });
    const localX = width / 2 + point.x, localY = height / 2 + point.y;
    placeBeam(room, x, y);
    placeBeam(sheetEl, localX, localY);
    if (!triedLight && sheetEl.dataset.face === "front" && localX >= 0 && localX <= width && localY >= 0 && localY <= height) {
      triedLight = true;
      getFace(state.sheet, "light");
    }
    beamFrame = requestAnimationFrame(drawFlashlight);
  }
  function updateFlashlight() {
    const lit = room.classList.toggle("is-lit", !!state.sheet && (shiftHeld || touchId !== null));
    if (lit) {
      const through = faces.light.querySelector(".through");
      if (through && sheetEl.dataset.face === "front") through.scrollTop = state.sheet.backScroll;
      if (!beamFrame) beamFrame = requestAnimationFrame(drawFlashlight);
    } else {
      cancelAnimationFrame(beamFrame);
      beamFrame = 0;
      beam = null;
      triedLight = false;
    }
  }
  function aim(e) { cursor = { x: e.clientX, y: e.clientY }; }
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch" || e.pointerId === touchId) aim(e);
  }, { passive: true });
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") aim(e);
  }, { passive: true });
  function setShiftHeld(held) {
    if (shiftHeld === held) return;
    shiftHeld = held;
    updateFlashlight();
  }
  const plainShift = (e) => e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
  function releaseStaleShift(e) {
    if (e.pointerType !== "touch" && !plainShift(e)) setShiftHeld(false);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift" && !e.repeat) setShiftHeld(plainShift(e));
    else releaseStaleShift(e);
  }, true);
  // A system shortcut can consume the Shift keyup. Mouse and pen events can confirm a release but never arm the beam.
  for (const event of ["keyup", "pointerdown", "pointermove", "pointerup"]) {
    window.addEventListener(event, releaseStaleShift, { capture: true, passive: true });
  }
  sheetEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary || e.target.closest("button")) return;
    touchId = e.pointerId;
    aim(e);
    updateFlashlight();
  }, { passive: true });
  for (const event of ["pointerup", "pointercancel"]) window.addEventListener(event, (e) => {
    if (e.pointerId !== touchId) return;
    touchId = null;
    cursor = null;
    updateFlashlight();
  });
  function resetFlashlight() {
    shiftHeld = false;
    touchId = null;
    cursor = null;
    updateFlashlight();
  }
  window.addEventListener("blur", resetFlashlight);
  document.addEventListener("visibilitychange", () => { if (document.hidden) resetFlashlight(); });
  faces.front.addEventListener("scroll", () => {
    faces.light.style.setProperty("--paper-scroll", `${-faces.front.scrollTop}px`);
  }, { passive: true });

  async function unfold(id, from) {
    const r = await post("api/paper", { op: "unfold", id });
    if (!r || !r.sheet) return;
    sound()?.paper();
    returnFocus = from || null;
    state.sheet = { id, requests: {}, backScroll: 0 };
    linesInto(faces.front, r.sheet.lines, { note: r.sheet.note });
    faces.back.textContent = ""; faces.light.textContent = "";
    faces.front.scrollTop = 0;
    faces.light.style.removeProperty("--paper-scroll");
    sheetEl.classList.remove("is-turning");
    sheetEl.dataset.kind = shelf.querySelector(`[data-id="${id}"]`)?.dataset.kind || "";
    room.hidden = false;
    showFace("front");
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
    touchId = null;
    updateFlashlight();
    setTimeout(() => { room.hidden = true; }, reduce.matches ? 0 : 260);
    if (state.pending) { closeUnder(); document.activeElement?.blur?.(); } // the story starts once the page is back where it was
    else if (returnFocus) returnFocus.focus({ preventScroll: true });
  }
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
      case "slide": await window.koyakBackdrop?.slide(f); return;
      case "flash": await window.koyakBackdrop?.flash(f); return;
      case "clear": {
        const ms = f.ms ?? 1200;
        window.koyakBackdrop?.clear(ms);
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
        state.on = true; edge.hidden = false;
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

  window.addEventListener("koyak:story", (e) => { if (e.detail && e.detail.planes) { state.on = true; edge.hidden = false; render(e.detail.planes); } });

  // TEMPORARY: the cutscene debug panel, on a local dev server only (it shows itself if the Worker lists scenes)
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    const s = document.createElement("script"); s.src = "debug.js"; document.body.appendChild(s);
  }

  /* ---------- what is here for this visitor ---------- */
  post("api/hello").then(async (h) => {
    if (!h || !h.arg) return;
    state.on = true;
    under.hidden = false; edge.hidden = false;
    render(h.planes || []);
    if (!h.steps || !h.steps.length) return;
    await (tw()?.ready || Promise.resolve());
    await wait(reduce.matches ? 300 : 2200); // let the page develop first
    if (tw() && !tw().typing && tw().turn === "you") tw().say(h.steps, { mode: h.mode });
  });
})();
