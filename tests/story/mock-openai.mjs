// A stand-in for OpenAI's Responses API, for exercising the story engine's model path locally.
// It answers the engine's structured calls with crude word-overlap guesses (it is not a model), and can be told
// to misbehave:  POST /__mode {"mode":"ok"|"hang"|"garbage"|"error"}.  Counts calls at GET /__calls.
//   node tests/story/mock-openai.mjs 4399
// Point the Worker at it:  --var OPENAI_BASE_URL:http://127.0.0.1:4399/v1 --var OPENAI_API_KEY:mock
import http from "node:http";

let mode = "ok";
const calls = {};
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]+/g) || []);
const overlap = (a, b) => { const B = words(b); let n = 0; for (const w of words(a)) if (w.length > 2 && B.has(w)) n++; return n; };

function answer(body) {
  const name = body.text?.format?.name || "text";
  calls[name] = (calls[name] || 0) + 1;
  const input = typeof body.input === "string" ? JSON.parse(body.input) : null;
  if (name === "interpret") {
    const best = input.allowed_intents.map((i) => ({ id: i.id, n: overlap(input.player, i.desc + " " + i.id) })).sort((a, b) => b.n - a.n)[0];
    if (!best || best.n === 0) return { intent: "freeform", confidence: "low", say: "MOCK MODEL: You do that, carefully. Nothing in the scene objects.", topic: "", path: "" };
    return { intent: best.id, confidence: "high", say: "", topic: "", path: "" };
  }
  if (name === "judge") {
    const l = input.line.toLowerCase();
    return { kind: /\byou(r)?\b/.test(l) && /\b(turn|carry|girl|tell|go)\b/.test(l) ? "invite" : /\b(stupid|smelly)\b/.test(l) ? "rude" : "ordinary" };
  }
  if (name === "chat_intent") {
    const best = input.intents.map((i) => ({ id: i.id, n: overlap(input.message, i.desc) })).sort((a, b) => b.n - a.n)[0];
    return { intent: best && best.n >= 2 ? best.id : "none" };
  }
  if (name === "text" && Array.isArray(body.input) && body.input[body.input.length - 1]?.content === "MOCK:INSTRUCTIONS") {
    return body.instructions; // lets a test see exactly what the chat model was told
  }
  if (name === "text") {
    const last = Array.isArray(body.input) ? body.input[body.input.length - 1]?.content : JSON.parse(body.input || "{}").newest_beat;
    return "MOCK MODEL: " + String(last || "").slice(0, 80);
  }
  return {};
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.url === "/__mode") { mode = JSON.parse(raw || "{}").mode || "ok"; res.end(JSON.stringify({ mode })); return; }
    if (req.url === "/__calls") { res.end(JSON.stringify({ mode, calls })); return; }
    if (!req.url.endsWith("/responses")) { res.writeHead(404); res.end(); return; }
    if (mode === "hang") return; // never answers: the Worker's deadline has to save the turn
    if (mode === "error") { res.writeHead(500, { "content-type": "application/json" }); res.end('{"error":{"message":"mock outage"}}'); return; }
    const body = JSON.parse(raw || "{}");
    const out = answer(body);
    const text = mode === "garbage" ? "{not json, and not what you asked for" : typeof out === "string" ? out : JSON.stringify(out);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] }));
  });
}).listen(Number(process.argv[2] || 4399), "127.0.0.1", () => console.log("mock openai on", process.argv[2] || 4399));
