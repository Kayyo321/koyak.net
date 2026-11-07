# koyak.net

Personal site of Koyak, systems programmer. Plain static HTML, CSS and JavaScript with no runtime dependencies beyond Google Fonts.

## Layout

| Path | What it is |
| --- | --- |
| `_src/*.html` | Page sources. Edit these. |
| `_build.py` | Wraps each source in the shared head, header and footer. Run `python3 _build.py` after editing. |
| `index.html`, `work.html`, `about.html`, `contact.html`, `404.html`, `work/*.html` | Built pages (committed, served as-is). |
| `assets/css/base.css` | Palette, type scale and shared components. |
| `assets/js/paper.js` | The paper-cutout and pencil engine: torn-edge filters, seeded scribbles and scroll-driven drawing. |
| `assets/img/` | Avatar and favicon. |

Underscore paths are ignored by GitHub Pages, so `_src/` and `_build.py` are never published.

## Design

- Palette: paper `#F4F2ED`, sheet `#FFFFFF`, ink `#0E0E0E`, graphite `#57544E`, rule `#D9D5CC`, signal `#E0401F`.
- Type: Figtree for everything you read, JetBrains Mono for details (addresses, stacks, dates).
- Every page has its own scene: the desk (home), card catalogue (work), graph-paper compiler pipeline (stasha), windows in transit (Waddle), boot-time memory map (OsDev), ruled notebook (about), envelope (contact), torn page (404).
- Motion is scroll-driven and respects `prefers-reduced-motion`. Without JavaScript every page renders fully assembled.

## Local preview

```sh
python3 _build.py
python3 -m http.server 8000
```
