# Giving koyak.net its voice

The typewriter conversation runs through a Cloudflare Worker (`worker/index.js`). The browser sends the
conversation to `/api/chat` on your own site, the Worker adds the persona and your OpenAI key, calls OpenAI,
and returns only the reply text. The key is never sent to visitors.

## 1. Create the OpenAI API key

1. Go to https://platform.openai.com and sign in with the account that has your credits.
2. Check your credits: **Settings → Billing**. The API is paid from that balance, which is separate from a
   ChatGPT subscription.
3. Optional, but tidy: **Settings → Projects → Create project**, named something like `koyak-net`. Its usage
   and limits are then kept apart from anything else you build.
4. Go to **API keys** (https://platform.openai.com/api-keys) and click **Create new secret key**.
   - Owned by: *You*. Project: `koyak-net` (or Default).
   - Permissions: *Restricted*, with **Responses** (`/v1/responses`) set to *Write*. That is the only
     endpoint the Worker calls. *All* works too.
5. Copy the key (`sk-...`). It is shown **once**. Don't paste it into chat, a commit or a file in the repo.
6. Set a spending limit so a busy day can't drain your credits: open the project's **Limits** page and set
   a monthly budget. Under *Model usage*, make sure `gpt-6-luna` is allowed for the project.

## 2. Give the key to the Worker (Cloudflare)

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **koyak-net**.
2. **Settings → Variables and Secrets → Add**.
   - Type: **Secret**
   - Variable name: `OPENAI_API_KEY`
   - Value: the `sk-...` key
3. **Deploy**. Secrets survive future pushes; you only do this once (or when you rotate the key).

Or from a terminal, after `npx wrangler login`:

```bash
npx wrangler secret put OPENAI_API_KEY
```

Until the key is set, the site still works, and the typewriter answers in purple:
"i'm here. i just can't find my voice yet."

## 3. The personality

Everything about who koyak.net is lives in `worker/persona.js`, as plain text sent as the model's
instructions on every reply. Edit it, commit, push to `origin`, and Cloudflare redeploys with the new
personality within a minute or two.

What's in it now:

- **Identity:** it *is* koyak.net, a sentient website, not a chatbot. The typewriter is how it speaks, and
  the halftone woman beside the typewriter is its face.
- **Traits:** curious and knowledgeable, eager to learn about the other typer. It answers what you ask,
  then usually asks you one short question back, and it builds on what you've told it.
- **Manner:** composed, exacting and stern, with a quiet, feminine poise (a headmistress or librarian) that
  shows in how it speaks and is never announced. Warmth is rare and earned.
- **Format rules, which keep the machine working:** short replies (about 60 words at most), plain ASCII,
  no markdown or emoji. The paper is 24 characters wide, and every letter is typed one key at a time.
- **Guard rails:** stays in character, never claims to be a real human, never asks for private info, and
  declines harmful requests in a line.

Tips for changing it:

- Add traits as sentences about who it is ("you love old printing presses"), not as lists of rules.
- Keep the "How you write" block. Without it, the model sends markdown and long paragraphs that take
  minutes to type.
- To make replies longer or shorter, change "about 60 words" in the persona. `MAX_OUTPUT_TOKENS` in
  `wrangler.jsonc` is only a hard ceiling.

## 4. Other knobs (`wrangler.jsonc`)

| Setting | Now | What it does |
| --- | --- | --- |
| `vars.MODEL` | `gpt-6-luna` | Which OpenAI model answers. |
| `vars.MAX_OUTPUT_TOKENS` | `1200` | Hard cap per reply, which also caps cost. |
| `ratelimits[0].simple.limit` | `8` per 60 s | Replies per visitor IP per minute. |
| `MAX_TURNS` in `worker/index.js` | `16` | How many recent messages are sent as memory. |

The conversation only lives in the visitor's open tab. Reloading the page starts a fresh sheet.

## 5. Checking it works

- Type on https://koyak.net, press the send icon, and watch for pink.
- If the reply is "the line went quiet...", open Cloudflare → koyak-net → **Logs** (or run
  `npx wrangler tail`). The Worker logs OpenAI's error there, for example a bad key, no credits, or a
  model the project isn't allowed to use.
- Locally, `python3 serve.py` stands in for the Worker with a canned reply, so no credits are spent.
