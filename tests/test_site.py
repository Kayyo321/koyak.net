"""Playwright checks for koyak.net (webapp-testing skill).
Run with the dev server up:   python3 tests/test_site.py
Or let the skill helper manage it:
  python3 ~/.claude/skills/webapp-testing/scripts/with_server.py --server "python3 serve.py" --port 4317 -- python3 tests/test_site.py
The talk checks need this repo's serve.py (it mocks /api/chat; nothing is sent to OpenAI).
Screenshots land in tests/shots/."""
import hashlib, os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("NET_URL", "http://localhost:4317/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "tests", "shots")
os.makedirs(SHOTS, exist_ok=True)
GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
results = []

def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))

def open_page(browser, w, h, dpr=1, motion="no-preference"):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, reduced_motion=motion)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL)
    page.wait_for_selector("canvas[data-ready]", timeout=20000)
    return ctx, page, errors

def canvas_hash(page):
    return hashlib.md5(page.evaluate("document.getElementById('plate-canvas').toDataURL()").encode()).hexdigest()

CONTRAST_JS = """() => {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = rgb => { const [r, g, b] = rgb.match(/[\\d.]+/g).map(Number); return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b); };
  const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !c.endsWith(', 0)') && c !== 'transparent') return c; el = el.parentElement; } return 'rgb(7, 9, 54)'; };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || !el.offsetParent || el.closest('svg,[hidden],.visually-hidden,.is-printed')) continue;
    const s = getComputedStyle(el), a = L(s.color), b = L(bgOf(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    out.push({ text: walker.currentNode.textContent.trim().slice(0, 30), ratio: +ratio.toFixed(2), need: large ? 3 : 4.5 });
  }
  return out;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=GL_ARGS)

    # 1. crops: only the girl and the wordmark, the girl filling most of the screen, right of centre.
    for name, w, h in [("desktop", 1440, 900), ("laptop", 1280, 720), ("tablet", 834, 1112), ("phone", 390, 844), ("small-phone", 320, 640)]:
        ctx, page, errors = open_page(b, w, h)
        page.wait_for_selector("#koyak.is-printed", timeout=20000)
        page.wait_for_timeout(1900)
        page.screenshot(path=f"{SHOTS}/{name}.png")
        sw, sh = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
        check(f"{name}: one screen, no scroll", sw <= w and sh <= h, f"{sw}x{sh} vs {w}x{h}")
        text = page.evaluate("document.body.innerText").split()
        check(f"{name}: no text but koyak.net", text == ["koyak", ".net"], " ".join(text)[:80])
        r = page.locator("#plate-canvas").bounding_box()
        check(f"{name}: girl takes most of the screen", r["width"] >= 0.6 * w if w < h else r["height"] >= h, f"{r['width']:.0f}x{r['height']:.0f}")
        cx = r["x"] + r["width"] / 2
        check(f"{name}: girl sits right of centre", cx > w / 2, f"centre x {cx:.0f} of {w}")
        k, n = page.locator("#koyak").bounding_box(), page.locator(".net").bounding_box()
        check(f"{name}: wordmark fully on screen", k["x"] >= 0 and k["y"] >= 0 and n["x"] + n["width"] <= w)
        check(f"{name}: koyak much larger than .net", k["height"] >= 3 * n["height"], f"{k['height']:.0f} vs {n['height']:.0f}px")
        fonts = page.evaluate("[getComputedStyle(document.getElementById('koyak')).fontFamily, getComputedStyle(document.querySelector('.net')).fontFamily]")
        check(f"{name}: koyak and .net in two fonts", fonts[0].split(",")[0] != fonts[1].split(",")[0], " / ".join(f.split(",")[0] for f in fonts))
        kc = page.locator("#koyak-canvas").bounding_box()
        check(f"{name}: halftone covers the word", kc["x"] <= k["x"] and kc["x"] + kc["width"] >= k["x"] + k["width"] and kc["y"] <= k["y"])
        check(f"{name}: no console errors", not errors, "; ".join(errors)[:200])
        ctx.close()

    # 2. pixel density: backing stores follow DPR.
    for dpr in (1, 2):
        ctx, page, _ = open_page(b, 1280, 800, dpr)
        page.wait_for_selector("#koyak.is-printed")
        page.wait_for_timeout(1900)
        for cid in ("plate-canvas", "koyak-canvas"):
            cw, css = page.evaluate(f"[document.getElementById('{cid}').width, document.getElementById('{cid}').getBoundingClientRect().width]")
            check(f"{dpr}x: {cid} backing store matches DPR", abs(cw - round(css * dpr)) <= 1, f"{cw}px for {css:.0f} css px")
        page.locator("#plate-canvas").screenshot(path=f"{SHOTS}/plate-{dpr}x.png")
        page.locator(".mark").screenshot(path=f"{SHOTS}/koyak-{dpr}x.png")
        ctx.close()

    # 3. contrast for real text (koyak itself is printed by the canvas, so its glyphs are transparent).
    ctx, page, _ = open_page(b, 1440, 900)
    page.wait_for_selector("#koyak.is-printed")
    rows = page.evaluate(CONTRAST_JS)
    bad = [r for r in rows if r["ratio"] < r["need"]]
    check("contrast: visible text meets AA", rows and not bad, ", ".join(f"{r['text']!r} {r['ratio']}" for r in bad[:5]) or f"{len(rows)} text nodes, min {min(r['ratio'] for r in rows)}")
    check("a11y: heading reads koyak.net", page.get_by_role("heading", name="koyak.net").count() == 1)
    ctx.close()

    # 4. koyak does nothing under the pointer: no change to the word, and the girl's loupe stays off.
    shot = lambda page, sel: hashlib.md5(page.locator(sel).screenshot(
        style=".pointer-loupe { visibility: hidden !important; }"
    )).hexdigest()
    ctx, page, _ = open_page(b, 1440, 900, 1, motion="reduce")  # reduced motion: no drift, so frames are stable
    page.wait_for_selector("#koyak.is-printed"); page.wait_for_timeout(300)
    k0, p0 = shot(page, ".mark"), shot(page, "#plate-canvas")
    k = page.locator("#koyak").bounding_box()
    for fx in (0.2, 0.5, 0.95):  # 0.95 is over the part of the word that sits on the girl's canvas
        page.mouse.move(k["x"] + k["width"] * fx, k["y"] + k["height"] * 0.5)
        page.wait_for_timeout(250)
    check("koyak: hover leaves the word unchanged", shot(page, ".mark") == k0)
    check("koyak: hover does not reach the girl's loupe", shot(page, "#plate-canvas") == p0)
    box = page.locator("#plate-canvas").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.5); page.wait_for_timeout(250)
    check("plate: hovering the girl leaves her screen on", shot(page, "#plate-canvas") == p0)
    loupe = page.locator(".pointer-loupe")
    check("pointer: the idle circle replaces the native cursor over the girl",
          loupe.is_visible() and loupe.get_attribute("data-mode") == "idle"
          and page.locator("#plate-canvas").evaluate("el => getComputedStyle(el).cursor") == "none")
    c = page.locator(".card").first.bounding_box()
    page.mouse.move(c["x"] + c["width"] / 2, c["y"] + c["height"] / 2); page.wait_for_timeout(250)
    check("pointer: the cursor activates over a clickable card", loupe.is_visible() and loupe.get_attribute("data-mode") == "active")
    page.mouse.move(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.5); page.wait_for_timeout(250)
    check("pointer: the idle circle returns when leaving the card", loupe.is_visible() and loupe.get_attribute("data-mode") == "idle")
    ctx.close()

    # 4a. the typewriter: under the title, left of the girl; keys type, the margin stops, Enter feeds a line.
    for name, w, h in [("desktop", 1440, 900), ("laptop", 1280, 720), ("tablet", 834, 1112), ("phone", 390, 844), ("small-phone", 320, 640)]:
        ctx, page, errors = open_page(b, w, h)
        page.wait_for_selector("#writer-canvas[data-ready]", timeout=20000)
        if w < h:  # stacked: her figure (the middle ~70% of her square) sits between the title and the paper
            pl, wb0, kc0 = page.locator("#plate-canvas").bounding_box(), page.locator("#writer-canvas").bounding_box(), page.locator("#koyak-canvas").bounding_box()
            fig_top, fig_bottom = pl["y"] + pl["height"] * 0.15, pl["y"] + pl["height"] * 0.85
            paper_top = wb0["y"] + wb0["height"] * 0.125
            check(f"{name}: girl clear of the typewriter", fig_bottom <= paper_top + 2, f"figure ends {fig_bottom:.0f}, paper starts {paper_top:.0f}")
            check(f"{name}: girl clear of the title", fig_top >= kc0["y"] + kc0["height"] - 2, f"figure starts {fig_top:.0f}, title ink ends {kc0['y'] + kc0['height']:.0f}")
        wr, k, girl = page.locator("#writer-canvas").bounding_box(), page.locator("#koyak").bounding_box(), page.locator("#plate-canvas").bounding_box()
        kc = page.locator("#koyak-canvas").bounding_box()  # includes the y's descender
        check(f"{name}: typewriter clear of the title", wr["y"] >= kc["y"] + kc["height"], f"top {wr['y']:.0f} vs title ink bottom {kc['y'] + kc['height']:.0f}")
        check(f"{name}: typewriter left of the girl", wr["x"] + wr["width"] / 2 < girl["x"] + girl["width"] / 2)
        mk = page.locator(".mark").bounding_box()
        off = (wr["x"] + wr["width"] / 2) - (mk["x"] + mk["width"] / 2)
        check(f"{name}: typewriter centred under koyak.net", abs(off) <= 2, f"off by {off:.1f}px")
        check(f"{name}: typewriter fully on screen", wr["x"] >= 0 and wr["y"] >= 0 and wr["x"] + wr["width"] <= w and wr["y"] + wr["height"] <= h + 1)
        ctx.close()

    ctx, page, errors = open_page(b, 1440, 900)
    page.wait_for_selector("#writer-canvas[data-ready]", timeout=20000)
    page.wait_for_timeout(1700)
    typed = lambda: page.evaluate("new Promise(r => setTimeout(() => r(document.getElementById('writer-canvas').dataset.typed), 200))")
    for ch in "Hello": page.keyboard.press(ch)
    page.keyboard.press("Space")
    for ch in "net": page.keyboard.press(ch)
    check("typewriter: the keyboard types", typed() == "Hello net", repr(typed()))
    page.keyboard.press("Enter")
    st = page.evaluate("({line: __typewriter.page.line, col: __typewriter.page.col})")
    check("typewriter: Enter starts a new line", st == {"line": 1, "col": 0}, str(st))
    for _ in range(30): page.keyboard.press("m")
    line2 = typed().split(" / ")[-1]
    check("typewriter: stops at the margin until Enter", line2 == "m" * 24, f"{len(line2)} chars")
    page.keyboard.press("Enter"); page.keyboard.press("z")
    check("typewriter: Enter frees the margin", typed().endswith(" / z"), typed()[-12:])
    g = page.evaluate("__typewriter.page.glyphs.filter(g => g.ch === 'm').slice(0, 6).map(g => [g.rot, g.dx, g.dy, g.a].map(v => v.toFixed(4)).join())")
    check("typewriter: no two strikes alike", len(set(g)) == len(g), f"{len(set(g))}/{len(g)} distinct")
    page.locator("#writer-canvas").screenshot(path=f"{SHOTS}/typewriter-typed.png")
    # pressing the machine: a key types its letter, the lever returns the carriage
    wb = page.locator("#writer-canvas").bounding_box()
    meta = page.evaluate("fetch('assets/typewriter.json').then(r => r.json())")
    to_px = lambda x, y: (wb["x"] + x / meta["size"][0] * wb["width"], wb["y"] + (y + 180) / (meta["size"][1] + 180) * wb["height"])
    q = next(k for k in meta["keys"] if k["k"] == "Q")
    page.mouse.click(*to_px(q["x"], q["y"]))
    check("typewriter: clicking a key types it", typed().endswith("zq"), typed()[-6:])
    lv = meta["lever"]
    before = page.evaluate("__typewriter.page.line")
    page.mouse.click(*to_px((lv["x0"] + lv["x1"]) / 2 + 30, lv["y0"] + 40))
    check("typewriter: the lever feeds a line", page.evaluate("__typewriter.page.line") == before + 1)
    # one strike, frozen in time: key down and typebar in the air at 40 ms, gone by 400 ms, letter printed
    shot = lambda: hashlib.md5(page.locator("#writer-canvas").screenshot()).hexdigest()
    page.evaluate("() => { const tw = __typewriter, t = performance.now() + 5000; tw.clock.now = () => t + 400; tw.render(); }")
    rest = shot()
    page.evaluate("() => { const tw = __typewriter, t = tw.clock.now(); tw.clock.now = () => t + 1000; tw.type('k'); tw.clock.now = () => t + 1040; tw.render(); }")
    mid = shot()
    page.locator("#writer-canvas").screenshot(path=f"{SHOTS}/typewriter-strike.png")
    page.evaluate("() => { const tw = __typewriter, t = tw.clock.now(); tw.clock.now = () => t + 600; tw.render(); }")
    after = shot()
    check("typewriter: a strike animates the key and typebar", mid != rest and mid != after)
    check("typewriter: the letter lands after the strike", after != rest and typed().endswith("k"))
    # endless: 500 lines later only what can still be on the canvas is kept, and it still types
    res = page.evaluate("""() => { const tw = __typewriter, t0 = performance.now(); tw.clock.now = () => performance.now();
      for (let i = 0; i < 500; i++) { for (const c of 'line ' + i) c === ' ' ? tw.space() : tw.type(c); tw.ret(); }
      tw.type('e'); tw.type('n'); tw.type('d');
      const ms = performance.now() - t0, lines = new Set(tw.page.glyphs.map(g => g.line));
      return { glyphs: tw.page.glyphs.length, lines: lines.size, lowest: Math.min(...lines), fed: tw.page.line, ms }; }""")
    back = page.evaluate("__typewriter.BACK")
    check("typewriter: text that leaves the top is dropped", res["lines"] <= 12 + back and res["glyphs"] <= (12 + back) * 24, f"{res['glyphs']} glyphs on {res['lines']} lines after {res['fed']} returns")
    check("typewriter: line numbers stay small forever", res["lowest"] >= -12 - back, f"lowest line {res['lowest']}")
    page.wait_for_timeout(400)
    check("typewriter: still types after 500 lines", typed().endswith("line 499 / end"), typed()[-20:])
    page.locator("#writer-canvas").screenshot(path=f"{SHOTS}/typewriter-endless.png")
    check("typewriter: no console errors", not errors, "; ".join(errors)[:200])
    ctx.close()

    # scrolling: the wheel rolls the sheet back through the last two messages; anything older is cleared
    ctx, page, errors = open_page(b, 1440, 900, 1, motion="reduce")
    page.wait_for_selector("#writer-canvas[data-ready]", timeout=20000)
    res = page.evaluate("""() => { const tw = __typewriter;
      const msg = (ch, her) => { for (let i = 0; i < 15; i++) { for (let k = 0; k < 6; k++) tw.type(ch, her); tw.ret(); } tw.ret(); };
      msg('a', false); msg('b', true); msg('c', false); msg('d', true);
      const chars = new Set(tw.page.glyphs.map(g => g.ch));
      return { a: chars.has('a'), b: chars.has('b'), c: chars.has('c'), d: chars.has('d') }; }""")
    check("scroll: the last two messages are kept", res["c"] and res["d"], str(res))
    check("scroll: older messages are cleared", not res["a"] and not res["b"], str(res))
    wb = page.locator("#writer-canvas").bounding_box()
    page.mouse.move(wb["x"] + wb["width"] / 2, wb["y"] + wb["height"] * 0.3)
    page.mouse.wheel(0, -200); page.wait_for_timeout(100)
    check("scroll: wheel up rolls the sheet back", page.evaluate("__typewriter.page.scroll") > 0)
    for _ in range(40): page.mouse.wheel(0, -400)
    page.wait_for_timeout(100)
    st = page.evaluate("({ s: __typewriter.page.scroll, max: __typewriter.maxScroll() })")
    check("scroll: stops at the start of the older kept message", st["max"] > 0 and abs(st["s"] - st["max"]) < 1, str(st))
    page.locator("#writer-canvas").screenshot(path=f"{SHOTS}/typewriter-scrolled.png")
    page.keyboard.press("x"); page.wait_for_timeout(100)
    check("scroll: typing rolls it back to the line in use", page.evaluate("__typewriter.page.scroll") == 0)
    page.mouse.wheel(0, 600); page.wait_for_timeout(100)
    check("scroll: the wheel never opens anything under the page", page.evaluate("document.documentElement.dataset.under") is None)
    check("scroll: no console errors", not errors, "; ".join(errors)[:200])
    ctx.close()

    # 4b. blink frames differ from the open frame only inside the eyes, so the sprite never shifts.
    sys.path.insert(0, os.path.join(ROOT, "art"))
    import numpy as np
    from PIL import Image
    from eyes import eye_mask
    outside = np.asarray(eye_mask()) == 0
    A = os.path.join(ROOT, "site", "assets")
    base = np.asarray(Image.open(os.path.join(A, "face-open.jpg")).convert("L")).astype(int)
    for n in ("blink-half", "blink-closed"):
        f = np.asarray(Image.open(os.path.join(A, f"face-{n}.jpg")).convert("L")).astype(int)
        d = int(np.abs(base - f)[outside].max())
        check(f"blink: {n} matches the open frame outside the eyes", d <= 8, f"max diff {d}")

    # 5. reduced motion: the plate is developed on the first frame and then holds still.
    ctx, page, _ = open_page(b, 1280, 800, 1, motion="reduce")
    page.wait_for_timeout(150); h1 = canvas_hash(page)
    page.wait_for_timeout(1500); h2 = canvas_hash(page)
    check("reduced motion: no develop animation or drift", h1 == h2)
    ctx.close()
    ctx, page, _ = open_page(b, 1280, 800, 1)
    page.wait_for_timeout(150); h1 = canvas_hash(page)
    page.wait_for_timeout(1500); h2 = canvas_hash(page)
    check("full motion: plate develops on load", h1 != h2)
    box = page.locator("#plate-canvas").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.45)
    page.wait_for_timeout(600)
    page.locator("#plate-canvas").screenshot(path=f"{SHOTS}/plate-loupe.png")
    ctx.close()

    # 6. the face: random blinks, sleep after idle, wake on return (only once sprite frames are built)
    import json
    frames = json.load(open(os.path.join(ROOT, "site", "assets", "frames.json")))
    if frames:
        idle_url = URL + "?idle=2"
        ctx = b.new_context(viewport={"width": 1280, "height": 800}); page = ctx.new_page()
        page.goto(idle_url); page.wait_for_selector("canvas[data-face=awake]", timeout=20000)
        saw_blink = page.evaluate("""() => new Promise(r => { const c = document.getElementById('plate-canvas');
          const o = new MutationObserver(() => { if (c.dataset.face === 'blinking') { o.disconnect(); r(true); } });
          o.observe(c, { attributes: true }); setTimeout(() => r(false), 9000); })""")
        check("face: blinks on its own", saw_blink or page.evaluate("document.getElementById('plate-canvas').dataset.face") == "asleep")
        page.wait_for_selector("canvas[data-face=asleep]", timeout=12000)
        check("face: falls asleep after the idle delay", True)
        page.locator("#plate-canvas").screenshot(path=f"{SHOTS}/face-asleep.png")
        page.evaluate("document.getElementById('plate-canvas').dataset.face")
        page.mouse.move(200, 200); page.mouse.move(260, 240)
        page.wait_for_selector("canvas[data-face=awake], canvas[data-face=blinking]", timeout=3000)
        check("face: wakes when you come back", True)
        page.wait_for_timeout(900)  # before the 2 s test idle sends her back to sleep
        page.locator("#plate-canvas").screenshot(path=f"{SHOTS}/face-awake.png")
        ctx.close()

        # leaving the page: she is already asleep when you return, and only your input wakes her
        ctx = b.new_context(viewport={"width": 1280, "height": 800}); page = ctx.new_page()
        page.goto(URL); page.wait_for_selector("canvas[data-face=awake]", timeout=20000)
        set_hidden = """h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
          document.dispatchEvent(new Event('visibilitychange')); }"""
        page.evaluate(set_hidden, True)
        check("away: asleep the moment the page is hidden", page.evaluate("document.getElementById('plate-canvas').dataset.face") == "asleep")
        page.wait_for_timeout(300)
        page.evaluate(set_hidden, False)
        seen = page.evaluate("""() => new Promise(r => { const c = document.getElementById('plate-canvas'), s = [c.dataset.face];
          const o = new MutationObserver(() => s.push(c.dataset.face)); o.observe(c, { attributes: true });
          setTimeout(() => r(s), 1500); })""")
        check("away: still asleep on return, no fall-asleep replay", seen == ["asleep"], ",".join(seen))
        page.locator("#plate-canvas").screenshot(path=f"{SHOTS}/face-returned.png")
        page.mouse.move(300, 300); page.mouse.move(340, 320)
        page.wait_for_selector("canvas[data-face=awake], canvas[data-face=blinking]", timeout=3000)
        check("away: wakes when you move after returning", True)
        ctx.close()
        ctx = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce"); page = ctx.new_page()
        page.goto(idle_url); page.wait_for_selector("canvas[data-face=awake]", timeout=20000)
        seen = page.evaluate("""() => new Promise(r => { const c = document.getElementById('plate-canvas'), s = new Set();
          const o = new MutationObserver(() => s.add(c.dataset.face)); o.observe(c, { attributes: true });
          setTimeout(() => r([...s]), 4500); })""")
        check("reduced motion: no blinks, sleep still happens", "blinking" not in seen and "asleep" in seen, ",".join(seen))
        ctx.close()
    else:
        print("SKIP  face checks: no sprite frames built yet (assets/sprites/blink.* and sleep.*)")

    # ---------- talking to koyak.net (serve.py stands in for the Worker's /api/chat) ----------
    ctx, page, errors = open_page(b, 1440, 900)
    page.wait_for_selector("canvas[data-face=awake]", timeout=20000)
    send = page.locator("#writer-send")
    plane = page.locator("#writer-send .plane")
    page.wait_for_selector("#writer-send .plane[data-ready]", timeout=10000)
    check("talk: send is off until something is typed", send.is_disabled())
    check("plane: half strength with nothing to send", "is-empty" in send.get_attribute("class"))
    geo = page.evaluate("""() => { const r = s => document.querySelector(s).getBoundingClientRect();
      const pl = r('#plate'), m = r('.mark'), w = r('#writer');
      return { girl: pl.x + pl.width * 0.15, mid: (Math.min(m.x, w.x) + Math.max(m.right, w.right)) / 2 }; }""")
    check("layout: title and typewriter centred left of her figure", abs(geo["mid"] - geo["girl"] / 2) <= 3, f"centre {geo['mid']:.0f}, room ends {geo['girl']:.0f}")
    page.evaluate("""() => { window.__voice = []; window.__stops = 0; const S = window.koyakSound, v = S.voiceShape, st = S.voiceStop;
      S.voiceShape = (o) => { __voice.push(document.getElementById('plate-canvas').dataset.face); return v(o); };
      S.voiceStop = () => { __stops++; return st(); }; }""")
    page.keyboard.type("hello there"); page.keyboard.press("Enter"); page.keyboard.type("who are you")
    check("talk: what was typed since the last send is the message", page.evaluate("__typewriter.draftText()") == "hello there who are you", page.evaluate("__typewriter.draftText()"))
    check("plane: full strength once there is a message", "is-empty" not in send.get_attribute("class"))
    send.click()
    page.wait_for_selector("canvas[data-turn=ai]", timeout=3000)
    page.wait_for_function("document.querySelector('#writer-send .plane').style.transform.includes('translate')", timeout=3000)
    check("plane: thrown to the right on send", True)
    page.wait_for_selector("#writer-send .plane[data-dissolve='1.00']", timeout=8000)
    check("plane: gone by the end of the throw", True)
    page.wait_for_selector("canvas[data-face=talking]", timeout=15000)
    before = page.evaluate("__typewriter.page.glyphs.filter(g => !g.ai).length")
    page.keyboard.type("zz")
    check("talk: the visitor can't type on koyak.net's turn", page.evaluate("__typewriter.page.glyphs.filter(g => !g.ai).length") == before)
    check("talk: send is off on koyak.net's turn", send.is_disabled())
    page.wait_for_selector("canvas[data-turn=you]", timeout=90000)
    check("talk: koyak.net's words are its own ink", page.evaluate("__typewriter.page.glyphs.some(g => g.ai)"))
    check("talk: lips stop when the typing does", page.evaluate("document.getElementById('plate-canvas').dataset.face") in ("awake", "blinking"))
    voice = page.evaluate("__voice")
    check("voice: she babbles only while her lips move", len(voice) > 5 and set(voice) == {"talking"}, f"{len(voice)} mouth shapes, faces {sorted(set(voice))}")
    check("voice: she falls silent in the pauses, not between every letter", 2 <= page.evaluate("__stops") < len(voice) / 3, f"{page.evaluate('__stops')} pauses over {len(voice)} mouth shapes")
    page.wait_for_selector("#writer-send .plane[data-dissolve='0.00']", timeout=8000)
    check("plane: reassembles where it started", plane.evaluate("c => c.style.transform") in ("", "translate(0px, 0px) rotate(0deg) scale(1)"))
    check("talk: the reply joins the conversation", page.evaluate("__typewriter.history.map(m => m.role).join()") == "user,assistant")
    page.keyboard.type("ok")
    lines = page.evaluate("""() => { const t = __typewriter.page, L = {}; for (const g of t.glyphs) (L[g.line] ||= []).push(g.ai ? 'a' : 'u');
      return Object.keys(L).map(Number).sort((a, b) => a - b).map(n => [n, L[n].includes('a') ? 'a' : 'u']); }""")
    gaps = [(lines[i + 1][0] - lines[i][0]) for i in range(len(lines) - 1) if lines[i][1] != lines[i + 1][1]]
    check("talk: one blank line between speakers", gaps == [2, 2], f"line steps where the speaker changes: {gaps}")
    page.locator("#writer").screenshot(path=f"{SHOTS}/typewriter-talk.png")
    check("talk: no console errors", not errors, "; ".join(errors)[:200])
    ctx.close()

    # ---------- ripples from the title, and the sound switch ----------
    ctx, page, errors = open_page(b, 1440, 900)
    page.wait_for_selector("#koyak.is-printed", timeout=20000)
    ov = page.locator("canvas.ripples")
    check("ripple: the water is still at rest", ov.get_attribute("data-live") in (None, "0"))
    page.locator("#koyak").click()
    page.wait_for_selector("canvas.ripples[data-live='1']", timeout=3000)
    check("ripple: pressing the title starts a ripple", True)
    page.locator(".card").nth(2).click()
    check("ripple: the cards ripple too", page.evaluate("koyakRipples.active()"))
    page.wait_for_selector("canvas.ripples[data-live='0']", timeout=8000)
    check("ripple: it dies away", True)
    page.keyboard.press("Tab")
    mute = page.locator("#mute")
    check("sound: on by default", mute.get_attribute("aria-pressed") == "false" and not page.evaluate("koyakSound.muted"))
    mute.click()
    check("sound: the speaker mutes", mute.get_attribute("aria-pressed") == "true" and page.evaluate("koyakSound.muted"))
    page.reload(); page.wait_for_selector("#mute.is-muted", timeout=5000)
    check("sound: muting is remembered", page.evaluate("koyakSound.muted"))
    page.locator("#mute").focus(); page.keyboard.press("Enter")
    check("sound: Enter on the speaker toggles it without typing", not page.evaluate("koyakSound.muted") and page.evaluate("__typewriter.page.line") == 0)
    check("ripple/sound: no console errors", not errors, "; ".join(errors)[:200])
    ctx.close()

    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
