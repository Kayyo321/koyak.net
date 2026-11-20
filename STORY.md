# The layer under the page

koyak.net has a small interactive story hidden under its homepage. This file covers how it is built, how its
private content is kept private, and how to run and test it. It does not describe the story, and nothing in
this repository does: the story lives in a sealed content pack that only the Worker can open.

## How it fits together

- **The page stays the page.** `site/` is unchanged for anyone who never looks for the story. `site/underside.js`
  adds a floor below the screen. Drag the bottom edge up, swipe up from the bottom, press the down key a few
  times, or Tab past the last control to find it. Paper collects there.
- **The server decides everything.** `worker/story/` holds a generic engine (`engine.js`) and a Durable Object
  per visitor (`visitor.js`, binding `VISITORS`). Visitors are identified by a random, HttpOnly cookie
  (`koyak_v`). The page sends only what the visitor typed or touched. The server owns the scene, the allowed
  moves, the endings and the collected paper, and it replies with a short script (lines to type, pauses,
  corrections, page effects). It never takes the page's word for anything.
- **Requests are safe to repeat.** Each turn carries an id, and the Durable Object handles one request at a
  time. A retried or doubled submission gets the same reply instead of happening twice, and a finished run is
  saved exactly once. Reloading the page picks up where the visitor left off.
- **The model is optional.** `worker/story/ai.js` uses the existing OpenAI integration (the `OPENAI_API_KEY`
  secret, the `MODEL` var) for three things: reading unusual input, judging a free-written line, and answering
  something the visitor invents. Every call has a deadline (`STORY_AI_TIMEOUT_MS`, default 8 s), and every one has
  an authored fallback for timeouts, errors, malformed output and values outside the allowed set. The model is
  only ever given the current scene, what this visitor has already found, and the moves allowed from here.
  Canonical lines and ending conditions are authored, never generated. Story turns don't count against the chat
  rate limit; when the limiter trips, they simply run without the model.
- **Ordinary chat stays ordinary.** `/api/chat` still answers like before. The only change is that the persona is
  given whatever this visitor has already found out (and nothing else), so the assistant can talk about it.

Endpoints (all `POST`, same-origin only): `/api/hello`, `/api/chat`, `/api/paper` (`op: unfold | turn | light`).

## Keeping the story private

| Where | What is there |
| --- | --- |
| `private/` (git-ignored) | The plaintext pack `story-pack.mjs`, private acceptance scripts, screenshots |
| `worker/story/pack.sealed.js` (tracked) | The pack, encrypted with AES-256-GCM. Bundled into the Worker, never served as an asset |
| Worker secret `STORY_PACK_KEY` | The 32-byte key, base64. Without it the pack can't be opened and the story layer is simply absent |
| `.dev.vars` (git-ignored) | The same key for local development |
| `worker/story/fixture.json` (tracked) | A small synthetic pack with the same shape, for tests and other developers |

The browser only ever receives content the visitor has reached: each face of each sheet is fetched when it is
turned to, and only for paper this visitor owns. The page source holds a few deliberate, spoiler-free hints and
nothing else.

### Sealing after editing the story

```bash
npm run story:seal
```

```bash
npm run story:check
```

`story:check` confirms the sealed pack opens with your local key and matches the plaintext. Commit only
`worker/story/pack.sealed.js`. **Back up the key** (a password manager is fine). With the key,
`node scripts/seal-story.mjs unseal` recovers the plaintext. Without it, the sealed pack is unreadable.

## Provisioning production (Cloudflare)

1. The Durable Object migration (`v1`, `Visitor`, SQLite-backed) is in `wrangler.jsonc` and applies on the next
   deploy. Nothing to click.
2. Give the Worker the pack key. Either pipe it straight from `.dev.vars` (it is never printed):

   ```bash
   npm run story:secret
   ```

   or in the dashboard: **Workers & Pages → koyak-net → Settings → Variables and Secrets → Add**, type **Secret**,
   name `STORY_PACK_KEY`, value `<base64 key from .dev.vars>`.
3. Deploy as usual (push to `origin`; Cloudflare builds and deploys).

Until `STORY_PACK_KEY` is set, the site behaves exactly as it did before: no greeting variations, nothing
under the page.

## Running it locally

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run story:keygen
```

```bash
npm run dev
```

`npm run dev` serves the real Worker (Durable Objects, the sealed pack) at http://localhost:4317/. Without an
OpenAI key, ordinary chat answers "i can't find my voice yet" and the story runs on authored logic alone.
`python3 serve.py` still works for the static page and the mocked chat, with no story layer.

If you don't have the key, run the synthetic story instead:

```bash
npm run dev:fixture
```

Optional knobs (`--var NAME:value` or `.dev.vars`): `STORY_FIXTURE=1` (use the fixture),
`STORY_GREET_CHANCE` (0 to 1), `STORY_AI=off`, `STORY_AI_TIMEOUT_MS`, `OPENAI_BASE_URL` (for a stand-in model).

## Tests

- `npm test`: the engine against the fixture (`tests/story/engine.test.mjs`), including a model that fails,
  lies or overreaches.
- `python3 tests/test_story.py`: the real homepage and typewriter against a Worker running the fixture on port
  4318 (see the file's header for the command). Covers both ways in, a bad end and its closing line, the paper,
  replay, the reprise, reloads, a doubled submission and two separate visitors.
- `tests/story/mock-openai.mjs`: a stand-in for the Responses API that can answer, hang, return garbage or fail.
  Use it to exercise the model path locally.
- `python3 tests/test_site.py`: the original site checks, run against `serve.py` as before.
- Acceptance runs against the real story are kept in `private/` and never committed.
