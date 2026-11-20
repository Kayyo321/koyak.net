/* koyak.net: static pages from site/, plus one endpoint that lets the site answer.
   POST /api/chat { messages: [{ role: "user" | "assistant", content }] } -> { reply }
   The OpenAI key lives only here, as the Worker secret OPENAI_API_KEY; the browser never sees it. */
import { PERSONA } from "./persona.js";

const MAX_TURNS = 16;   // the most recent messages sent upstream
const MAX_CHARS = 1500; // per message: the typewriter can't hold much more than this anyway

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return chat(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function chat(request, env, url) {
  if (request.method !== "POST") return json({ error: "method" }, 405);

  // only this site's own pages may use the endpoint (it spends real credits)
  let sameSite = false;
  try { sameSite = new URL(request.headers.get("origin")).host === url.host; } catch {}
  if (!sameSite) return json({ error: "origin" }, 403);

  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") || "anon" });
    if (!success) return json({ error: "rate" }, 429);
  }
  if (!env.OPENAI_API_KEY) return json({ error: "no-key" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "body" }, 400);

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.MODEL || "gpt-6-luna",
      instructions: PERSONA,
      input: messages,
      max_output_tokens: Number(env.MAX_OUTPUT_TOKENS) || 1200,
      store: false,
    }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));

  if (!upstream.ok) {
    console.error("openai", upstream.status, (await upstream.text()).slice(0, 600)); // visible in `wrangler tail` / Workers logs
    return json({ error: "upstream", status: upstream.status }, 502);
  }
  const data = await upstream.json();
  const reply = (data.output || [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("")
    .trim();
  if (!reply) {
    console.error("openai empty", data.status, JSON.stringify(data.incomplete_details || {}));
    return json({ error: "empty" }, 502);
  }
  return json({ reply });
}
