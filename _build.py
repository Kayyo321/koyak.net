#!/usr/bin/env python3
"""Stamp the shared head, header and footer around each page in _src/.

Each source file starts with a front-matter comment:
<!--
title: Page title
description: One sentence for search and link previews.
nav: home | work | about | contact | none
out: path/of/output.html
-->
then an optional <style> block (moved into <head>), the page markup, and an
optional trailing <script> block (run after paper.js, before Paper.start()).

Run:  python3 _build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "_src"

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="theme-color" content="#F4F2ED">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="https://koyak.net/assets/img/avatar.png">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="{base}assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="{base}assets/css/base.css">
{style}
</head>
<body class="page-{slug}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="{base}index.html"><img src="{base}assets/img/avatar.webp" alt="" width="32" height="32">koyak</a>
    <nav class="site-nav" aria-label="Main">
      <a href="{base}work.html"{cur_work}>Work</a>
      <a href="{base}about.html"{cur_about}>About</a>
      <a href="{base}contact.html"{cur_contact}>Contact</a>
    </nav>
  </div>
</header>
<main id="main">
"""

FOOT = """</main>
<footer class="site-foot">
  <div class="wrap">
    <p class="sign">Working on something close to the metal? I'd like to hear about it.</p>
    <nav aria-label="Footer">
      <a href="{base}work.html">Work</a>
      <a href="{base}about.html">About</a>
      <a href="{base}contact.html">Contact</a>
      <a href="https://github.com/Kayyo321" rel="me noopener">GitHub</a>
    </nav>
    <div class="meta mono"><span>&copy; 2026 Koyak</span><span>github.com/Kayyo321</span></div>
  </div>
</footer>
<script src="{base}assets/js/paper.js"></script>
{script}
<script>Paper.start();</script>
</body>
</html>
"""


def build(path: pathlib.Path) -> str:
    text = path.read_text()
    m = re.match(r"\s*<!--(.*?)-->", text, re.S)
    meta = dict(line.split(":", 1) for line in m.group(1).strip().splitlines())
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    body = text[m.end():]
    style = ""
    sm = re.match(r"\s*(<style>.*?</style>)", body, re.S)
    if sm:
        style, body = sm.group(1), body[sm.end():]
    script = ""
    jm = re.search(r"(<script>(?:(?!<script>).)*?</script>)\s*$", body, re.S)
    if jm:
        script, body = jm.group(1), body[: jm.start()]
    out = meta["out"]
    base = "../" * out.count("/")
    nav = meta.get("nav", "none")
    fill = dict(
        title=meta["title"], description=meta["description"], base=base, style=style, script=script,
        slug=pathlib.Path(out).stem,
        cur_work=' aria-current="page"' if nav == "work" else "",
        cur_about=' aria-current="page"' if nav == "about" else "",
        cur_contact=' aria-current="page"' if nav == "contact" else "",
    )
    html = HEAD.format(**fill) + body.strip("\n") + "\n" + FOOT.format(**fill)
    (ROOT / out).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / out).write_text(html)
    return out


if __name__ == "__main__":
    for src in sorted(SRC.glob("*.html")):
        print("built", build(src))
