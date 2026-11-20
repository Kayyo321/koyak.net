/* koyak.net: static pages from site/, plus the endpoints that let the site answer.
   POST /api/chat  { messages: [{ role, content }], turn? } -> { reply, steps?, mode?, planes? }
   POST /api/hello {}                                       -> { arg, steps, mode, planes }
   POST /api/paper { op: "unfold" | "turn" | "light", id }  -> { sheet, steps?, mode?, planes? }
   The OpenAI key lives only here, as the Worker secret OPENAI_API_KEY; the browser never sees it.
   Anything the site remembers about a visitor lives server-side in their Visitor object (worker/story/). */
import { PERSONA } from "./persona.js";
import { loadPack } from "./story/pack.js";
import { cutscenes } from "./story/engine.js";
export { Visitor } from "./story/visitor.js";

const MAX_TURNS = 16;   // the most recent messages sent upstream
const MAX_CHARS = 1500; // per message: the typewriter can't hold much more than this anyway
const COOKIE = "koyak_v";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return chat(request, env, url);
    if (url.pathname === "/api/hello") return hello(request, env, url);
    if (url.pathname === "/api/paper") return paperRoute(request, env, url);
    if (url.pathname === "/api/debug/cutscenes") return debugCutscenes(env, url);
    return env.ASSETS.fetch(request);
  },
};

// TEMPORARY: the cutscene debug panel (site/debug.js). Lists the scenes only on a local dev server with
// STORY_DEBUG=1 in .dev.vars; everywhere else it answers with nothing, and the panel stays hidden.
async function debugCutscenes(env, url) {
  if (env.STORY_DEBUG !== "1" || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) return json({ cutscenes: null });
  const pack = await loadPack(env);
  if (!pack) return json({ cutscenes: null });
  return json({ cutscenes: cutscenes(pack) });
}

// only this site's own pages may use the endpoints (they spend real credits and hold per-visitor state)
function sameSite(request, url) {
  try { return new URL(request.headers.get("origin")).host === url.host; } catch { return false; }
}

/* ---------- the visitor: an opaque random id in an HttpOnly cookie, nothing else ---------- */
function visitor(request, env, url) {
  if (!env.VISITORS) return null;
  const m = /(?:^|;\s*)koyak_v=([a-f0-9]{32})(?:;|$)/.exec(request.headers.get("cookie") || "");
  let id = m && m[1], fresh = false;
  if (!id) { id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""); fresh = true; }
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const cookie = fresh ? { "set-cookie": `${COOKIE}=${id}; Path=/api/; Max-Age=31536000; HttpOnly; SameSite=Strict${secure}` } : {};
  return { stub: env.VISITORS.get(env.VISITORS.idFromName(id)), cookie };
}

async function hello(request, env, url) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!sameSite(request, url)) return json({ error: "origin" }, 403);
  const v = visitor(request, env, url);
  if (!v) return json({ arg: false });
  const chance = env.STORY_GREET_CHANCE != null ? Number(env.STORY_GREET_CHANCE) : undefined;
  try {
    return json(await v.stub.hello({ chance }), 200, v.cookie);
  } catch (e) {
    console.error("hello", String(e).slice(0, 300));
    return json({ arg: false }, 200, v.cookie);
  }
}

async function paperRoute(request, env, url) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!sameSite(request, url)) return json({ error: "origin" }, 403);
  const v = visitor(request, env, url);
  if (!v) return json({ error: "gone" }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
  const id = typeof body?.id === "string" && /^(origin|p\d{1,4})$/.test(body.id) ? body.id : null;
  const face = { unfold: "front", turn: "back", light: "light" }[body?.op];
  if (!id || !face) return json({ error: "body" }, 400);
  try {
    const out = face === "front" ? await v.stub.unfold({ id }) : { sheet: await v.stub.paper({ id, face }) };
    if (!out || !out.sheet) return json({ error: "gone" }, 404, v.cookie);
    return json(out, 200, v.cookie);
  } catch (e) {
    console.error("paper", String(e).slice(0, 300));
    return json({ error: "busy" }, 503, v.cookie);
  }
}

async function chat(request, env, url) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!sameSite(request, url)) return json({ error: "origin" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "body" }, 400);
  const turnId = typeof body?.turn === "string" && /^[\w-]{8,64}$/.test(body.turn) ? body.turn : null;

  // the limiter guards the model, not the page: when it trips, story turns still run on authored logic
  let limited = false;
  if (env.LIMITER && env.OPENAI_API_KEY) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") || "anon" });
    limited = !success;
  }

  const v = visitor(request, env, url);
  let facts = [];
  if (v) {
    try {
      const r = await v.stub.turn({ text: messages[messages.length - 1].content, turnId, aiAllowed: !limited });
      if (r && r.story) return json({ reply: r.reply, steps: r.steps, mode: r.mode, planes: r.planes }, 200, v.cookie);
      facts = (r && r.facts) || [];
    } catch (e) {
      console.error("visitor", String(e).slice(0, 300)); // fall through to an ordinary answer
    }
  }
  const cookie = v ? v.cookie : {};

  if (limited) return json({ error: "rate" }, 429, cookie);
  if (!env.OPENAI_API_KEY) return json({ error: "no-key" }, 503, cookie);

  // what this visitor has found out is all the model is told; nothing they haven't earned is in its reach
  const instructions = facts.length
    ? PERSONA + "\n\nThings this visitor already knows, which you may speak about plainly if they ask (never add to them):\n- " + facts.join("\n- ")
    : PERSONA;

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 25000); // a stuck upstream shouldn't hold the visitor's turn forever
  const upstream = await fetch((env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "") + "/responses", {
    method: "POST", signal: deadline.signal,
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.MODEL || "gpt-6-luna",
      instructions,
      input: messages,
      max_output_tokens: Number(env.MAX_OUTPUT_TOKENS) || 1200,
      store: false,
    }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  clearTimeout(timer);

  if (!upstream.ok) {
    console.error("openai", upstream.status, (await upstream.text()).slice(0, 600)); // visible in `wrangler tail` / Workers logs
    return json({ error: "upstream", status: upstream.status }, 502, cookie);
  }
  const data = await upstream.json().catch(() => ({}));
  const reply = (data.output || [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("")
    .trim();
  if (!reply) {
    console.error("openai empty", data.status, JSON.stringify(data.incomplete_details || {}));
    return json({ error: "empty" }, 502, cookie);
  }
  return json({ reply }, 200, cookie);
}
