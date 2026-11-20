"""Browser checks for the hidden layer, run against the synthetic fixture pack (no real story text here).
Start a Worker with the fixture, then run this:
  npx wrangler dev --port 4318 --var STORY_FIXTURE:1 --var STORY_GREET_CHANCE:1 --persist-to .wrangler/fixture-state
  python3 tests/test_story.py
It plays through the real homepage and typewriter: the greeting, both ways in, a bad end and its closing line,
paper faces, replay, the reprise, a reload mid-scene, a doubled submission and two separate visitors."""
import json, os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("STORY_URL", "http://localhost:4318/")
GL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
results = []

def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({str(detail)[:200]})" if detail else ""), flush=True)

def open_page(b, w=1280, h=800, ctx=None):
    ctx = ctx or b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "503" not in m.text else None)
    page.goto(URL)
    page.wait_for_selector("#writer-canvas[data-ready]", timeout=20000)
    page.wait_for_selector(".shelf .fold", state="attached", timeout=10000)
    return ctx, page, errs

status = "document.getElementById('writer-status').textContent"
def idle(page):
    page.wait_for_function("() => __typewriter.turn === 'you' && !document.documentElement.dataset.paper", timeout=60000)

def said_after(page, before):
    page.wait_for_function(f"(b) => {status} !== b && /wrote:/.test({status}) && __typewriter.turn === 'you'", arg=before, timeout=60000)
    return page.evaluate(status).replace("koyak.net wrote: ", "")

def talk(page, text):
    idle(page)
    before = page.evaluate(status)
    col = 0
    for word in text.split(" "):
        if col and col + 1 + len(word) > 24: page.keyboard.press("Enter"); col = 0
        if col: page.keyboard.press("Space"); col += 1
        page.keyboard.type(word); col += len(word)
    page.click("#writer-send")
    return said_after(page, before)

def wheel_open(page):
    # take hold of the bottom edge and drag it up (the wheel only scrolls the typewriter's sheet)
    w, h = page.viewport_size["width"], page.viewport_size["height"]
    page.mouse.move(w * 0.3, h - 6); page.mouse.down()
    for y in range(h - 6, h - 300, -30): page.mouse.move(w * 0.3, y)
    page.mouse.up()
    page.wait_for_function("document.documentElement.dataset.under === 'open'", timeout=5000)

def unfold(page, pid):
    if page.evaluate("document.documentElement.dataset.under") != "open": page.evaluate("koyakPaper.open()")
    page.click(f".fold[data-id='{pid}']")
    page.wait_for_selector("#sheet-room.is-open")
    return page.evaluate("document.querySelector('.face-front').innerText")

def fold_and_hear(page):
    before = page.evaluate(status)
    page.keyboard.press("Escape")
    return said_after(page, before)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=GL)

    # the page as served: two clues in the source, no story, and nothing under the page until the server says so
    ctx, page, errs = open_page(b)
    html = page.request.get(URL).text()
    check("source: greeting clue", "She still gets the first word wrong sometimes." in html)
    check("source: underside clue", "Paper tends to catch on the underside." in html)
    check("source: no fixture text in the page", "FIXTURE" not in html)

    # the floor: the wheel doesn't reach it, and the bottom edge says nothing until it has been pulled up once
    edge_cursor = "getComputedStyle(document.querySelector('.pull-edge')).cursor"
    loupe = "getComputedStyle(document.querySelector('.pointer-loupe')).visibility"
    page.mouse.move(640, 400)
    for _ in range(10): page.mouse.wheel(0, 120); page.wait_for_timeout(40)
    page.wait_for_timeout(300)
    check("floor: the wheel doesn't lift the page", page.evaluate("document.documentElement.dataset.under") is None)
    page.mouse.move(640, 797); page.wait_for_timeout(250)
    check("floor: the edge looks like nothing before it is found", page.evaluate(edge_cursor) == "default" and page.evaluate(loupe) == "hidden")
    page.mouse.move(640, 400); page.mouse.down(); page.mouse.move(640, 300); page.mouse.up(); page.wait_for_timeout(300)
    check("floor: dragging elsewhere doesn't lift the page", page.evaluate("document.documentElement.dataset.under") is None)
    wheel_open(page)
    check("floor: dragging the bottom edge up lifts the page", True)
    page.mouse.move(640, 300); page.mouse.down(); page.mouse.move(640, 400); page.mouse.move(640, 500); page.mouse.up()
    page.wait_for_timeout(400)
    check("floor: dragging it back down puts the page back", page.evaluate("document.documentElement.dataset.under") is None)
    page.mouse.move(640, 797); page.wait_for_timeout(250)
    check("floor: once found, the edge can be held", page.evaluate(edge_cursor) == "grab" and page.evaluate(loupe) == "visible")

    # discovery by the typo
    page.wait_for_function("__typewriter.history.length > 0", timeout=15000); idle(page)
    check("greeting: the slip is corrected on the sheet", page.evaluate("__typewriter.history[0].content") == "hello. how may i help?")
    check("typo: noticed", talk(page, "why did you type halp") == "FIXTURE: typo reply.")
    r = talk(page, "what did you used to do")
    check("typo: the way in", r == "FIXTURE: job reply.")
    wheel_open(page)
    check("first plane: front", unfold(page, "origin") == "FIXTURE ORIGIN FRONT.")
    check("first plane: then the question", fold_and_hear(page) == "FIXTURE: what now?")
    check("no console errors", not errs, errs)
    ctx.close()

    # discovery by scrolling, then a bad end, the closing line, and the paper
    ctx, page, errs = open_page(b)
    idle(page)
    wheel_open(page); unfold(page, "origin")
    page.click(".corner"); page.wait_for_timeout(300)
    check("first plane: its back", page.evaluate("document.querySelector('.face-back').innerText") == "FIXTURE ORIGIN RULE.")
    fold_and_hear(page)
    check("scene: ambiguity doesn't advance", talk(page, "flibbertigibbet") == "FIXTURE: unclear at the quay.")
    talk(page, "climb the stair")
    check("scene: looking is safe", talk(page, "look") == "FIXTURE: steps up to a lamp room.")
    r = talk(page, "go up to the top")
    check("bad end: coda asked", r.endswith("FIXTURE CODA: the lamp. FIXTURE: your last line?"), r)
    r = talk(page, "worth it")
    check("bad end: kept and folded", r.startswith("FIXTURE: kept.") and page.evaluate("[...document.querySelectorAll('.shelf .fold')].length") == 2, r)
    front = unfold(page, "p1")
    note = page.evaluate("[...document.querySelector('.face-front').childNodes].filter(n => n.nodeType === 8).map(n => n.textContent.trim())")
    check("paper: front keeps the line, and a clue in the markup", "worth it" in front and note == ["FIXTURE NOTE."], (front, note))
    page.focus(".sheet"); page.keyboard.press("Enter"); page.wait_for_timeout(400)
    check("paper: held to the light", "FIXTURE IMPRESSION." in page.evaluate("document.querySelector('.face-light').innerText"))
    page.keyboard.press("Escape")
    r = talk(page, "yes")
    check("replay: a bare yes right after the offer", r.startswith("FIXTURE: again from the quay."), r)
    talk(page, "stair")
    page.reload(); page.wait_for_selector("#writer-canvas[data-ready]")
    r = said_after(page, "")
    check("reload mid-scene: picks up where it was", "FIXTURE: on the stair." in r, r)
    talk(page, "top")
    # a doubled submission of the closing line (same turn id, sent twice at once)
    out = page.evaluate("""async () => {
      const send = () => fetch('api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'your turn' }], turn: 'dup-0123456789' }) }).then(r => r.json());
      const [a, b] = await Promise.all([send(), send()]);
      return { same: a.reply === b.reply, planes: a.planes.length, mode: a.mode };
    }""")
    check("double submit: one reply, one plane", out == {"same": True, "planes": 3, "mode": "reprise"}, out)
    page.reload(); page.wait_for_selector("#writer-canvas[data-ready]")
    r = said_after(page, "")
    check("reprise: resumes after a reload, hands swapped", r == "FIXTURE: reprise, beat one." and page.evaluate("__typewriter.swapped"), r)
    r = talk(page, "a heron blocks the way")
    check("reprise: answers what was written (no model here)", r.startswith("FIXTURE ECHO 1: a heron blocks the way."), r)
    talk(page, "then rain")
    r = talk(page, "you are late")
    check("reprise: finale, hands back", r == "FIXTURE REPRISE: thank you." and not page.evaluate("__typewriter.swapped"), r)
    page.reload(); page.wait_for_selector("#writer-canvas[data-ready]"); page.wait_for_selector(".shelf .fold", state="attached")
    check("memory: kept after a reload", talk(page, "what do you do for fun") == "FIXTURE: fun memory.")
    check("no console errors", not errs, errs)
    ctx.close()

    # two visitors never share a story
    c1, p1, _ = open_page(b); c2, p2, _ = open_page(b)
    for pg in (p1, p2): idle(pg)
    wheel_open(p1); unfold(p1, "origin"); fold_and_hear(p1); talk(p1, "stair")
    r = talk(p2, "stair")
    check("isolation: the other visitor isn't in the story", "FIXTURE" not in r, r)
    c1.close(); c2.close()
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
