/* A small engine for authored text adventures told on the typewriter.
   It knows nothing about any particular story. Scenes, lines, endings, clue progression and model prompts all
   come from a content pack (pack.js opens the real one; fixture.json is a synthetic one for tests and docs).
   Everything here is pure: state in, state out, plus "steps" for the page to perform
   ({ say }, { type }, { erase }, { pause }, { fx }). The model is optional and always has a fallback.

   Modes: "chat" (ordinary conversation), "scene" (a run through the story), "coda" (after a bad end: the
   visitor writes one closing line), "reprise" (the visitor narrates and the narrator plays). */

const MAX_LINE = 240;      // what the page will accept as one turn
const TURN_CACHE = 16;     // replies remembered per visitor, for retried or doubled submissions

/* ---------- text ---------- */
export function norm(s) {
  return String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[‘’‛′`]/g, "'").replace(/[“”″]/g, '"')
    .replace(/\b(what|it|that|where|who|there|here|he|she|how|whose|which)'s\b/g, "$1 is")
    .replace(/\bcan't\b/g, "can not").replace(/\bwon't\b/g, "will not").replace(/n't\b/g, " not")
    .replace(/'re\b/g, " are").replace(/'m\b/g, " am").replace(/'ll\b/g, " will").replace(/'ve\b/g, " have").replace(/'d\b/g, " would")
    .replace(/'s\b/g, "s")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
export function printable(s, max = MAX_LINE) {
  return String(s || "").normalize("NFKC")
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[*_#`<>{}\\]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
const cache = new Map();
function rx(src) {
  if (!cache.has(src)) cache.set(src, new RegExp(src, "i"));
  return cache.get(src);
}
// the length of the longest match of any pattern in the list (0 = no match)
function hit(list, text) {
  let best = 0;
  for (const src of [].concat(list || [])) { const m = rx(src).exec(text); if (m) best = Math.max(best, m[0].length || 1); }
  return best;
}
const any = (list, text) => hit(list, text) > 0;

/* ---------- visitor state ---------- */
export function freshVisitor() {
  // facts persist across runs; turns caches replies by turn id; offer is what she just offered, for a bare "yes"
  return { v: 1, mode: "chat", facts: {}, planes: [], run: null, coda: null, reprise: null, turns: [], ended: 0, runs: 0, offer: null };
}
const learn = (vs, list) => { for (const f of [].concat(list || [])) if (f) vs.facts[f] = true; };
const note = (run, list) => { for (const f of [].concat(list || [])) if (f) run.seen[f] = true; };

export function remember(vs, turnId, out) {
  if (!turnId) return;
  vs.turns = vs.turns.filter((t) => t.id !== turnId).concat([{ id: turnId, out }]).slice(-TURN_CACHE);
}
export function recalled(vs, turnId) {
  return turnId ? vs.turns.find((t) => t.id === turnId)?.out || null : null;
}

/* ---------- steps ---------- */
const say = (t) => (t ? { say: t } : null);
const flat = (...xs) => xs.flat(Infinity).filter(Boolean);
export function replyText(steps) {
  return steps.filter((s) => s.say || s.type).map((s) => s.say || s.type).join(" ").replace(/\s+/g, " ").trim();
}
// a pack line may be a string, a list of steps, or a list of alternatives used in turn
function lines(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function stepsOf(v, run) {
  return lines(v).map((s) => (typeof s === "string" ? say(fill(s, run)) : s.say ? { ...s, say: fill(s.say, run) } : s));
}
function nth(v, n) { const l = lines(v); return l.length ? l[Math.min(n, l.length - 1)] : null; }
const bump = (run, k) => (run.count[k] = (run.count[k] || 0) + 1) - 1;

/* ---------- planes (what the visitor keeps under the page) ---------- */
export function publicPlane(p) { return { id: p.id, kind: p.kind, n: p.n }; }
export function listPlanes(pack, vs) {
  return [{ id: "origin", kind: "origin", n: 0, opened: !!vs.facts.played }].concat(vs.planes.map(publicPlane));
}
function addPlane(vs, data) {
  // exactly once per finished run, whatever happens to the request that finishes it
  const same = vs.planes.find((p) => p.runId === data.runId);
  if (same) return same;
  const n = vs.planes.length + 1;
  const plane = { id: "p" + n, n, scrap: n - 1, at: Date.now(), ...data };
  vs.planes.push(plane);
  return plane;
}

/* ---------- runs ---------- */
function newRun(pack, vs, rand) {
  const paths = Object.keys(pack.voices?.paths || {});
  vs.runs = (vs.runs || 0) + 1;
  vs.run = {
    id: "r" + vs.runs + "-" + Math.floor(rand() * 1e9).toString(36),
    scene: pack.start, seen: {}, count: {}, heard: [], turns: 0,
    real: paths.length ? paths[Math.floor(rand() * paths.length)] : null,
  };
  voicesFor(pack, vs.run);
  vs.mode = "scene";
  learn(vs, "played");
  return vs.run;
}
// {a.name}, {b.voice}, {here.name}, {a.listen}: the two voices of a split path, filled in for this run
function fill(text, run) {
  if (!text || !run || !run.voices) return text;
  return String(text).replace(/\{(\w+)\.(\w+)\}/g, (m, who, what) => {
    const v = run.voices[who === "here" ? run.here : who];
    if (!v) return m;
    if (what === "name" || what === "voice") return v[what];
    return v.lines?.[what] ?? m;
  });
}
function voicesFor(pack, run) {
  if (!pack.voices || run.voices) return;
  run.voices = {};
  for (const [id, p] of Object.entries(pack.voices.paths)) {
    const side = id === run.real ? "real" : "false";
    const ls = {};
    for (const [k, v] of Object.entries(pack.voices.lines || {})) ls[k] = v[side];
    run.voices[id] = { name: p.name, voice: p.voice, lines: ls };
  }
}

/* ---------- a turn inside the story ---------- */
const GENERIC = {
  look: ["^(l|look|look around|where am i|describe|what do i see|observe|survey|look about|look round)( here| around)?$", "\\blook around\\b", "\\bwhere am i\\b", "\\bwhat (do i|can i) see\\b"],
  listen: ["\\b(listen|hear|what is that sound|what do i hear|eavesdrop)\\b"],
  touch: ["\\b(touch|feel|pat|knock|stroke|poke|prod|tap)\\b"],
  inspect: ["\\b(look at|look in|look under|look behind|look for|examine|inspect|check|study|read|search|peer at|peek at|stare at|x)\\b"],
  back: ["\\b(go back|turn back|back up|walk back|head back|retreat|turn around|return|backtrack)\\b", "^back$"],
  wait: ["^(wait|z|do nothing|stand still|stay put|stay here|stand there)$"],
  // asking what there is to do here: answered with this scene's own hint. HELP_ASKED is the stricter half, for the
  // modes where a short line like "now what" could just as well be the visitor's answer
  help: ["^(what now|now what|what next|and now)$"],
  inventory: ["^(i|inv|inventory|what do i have|what am i carrying|check my pockets|items)$"],
  recall: ["\\bwhat did (they|she|the voices?|each|both|either|it) (say|tell)\\b", "\\b(remind me|recap|who said)\\b"],
  ask: ["\\b(ask|say to|call to|call out to|shout to|tell|question|answer|reply to|talk to|speak to)\\b"],
  question: ["^(what|who|where|why|how|is|are|do|did|can|could|will|would|whats)\\b"],
  both: ["\\b(both|each|either|them|everyone|all of them)\\b"],
};

const HELP_ASKED = [
  "^(help|hint|hints|options|choices|commands|moves|clue|clues)( (me|please|pls|plz))?$",
  "^(give me |i need |can i have |could i have |can i get )?(a |an |some |any )?(help|hints?|clues?|tips?)( (please|pls|plz))?$",
  "\\bwhat (are|r) (my|the|our|me) (options|choices|moves)\\b", "\\b(my|any|the|what) options\\b",
  "\\bwhat (can|could|should|shall|do|may|might) (i|we) (do|try|say|write)\\b(?! (with|to|about|for|if|when|that|this)\\b)",
  "\\bwhat (am i|are we) (supposed|meant|allowed|able) to (do|try|say|write)\\b",
  "\\bwhat (is|are) there to do\\b", "\\bwhat (are|r) (the|my) (commands|verbs)\\b",
  "\\b(where|which way|which ways) (can|could|should|do) (i|we) go\\b",
  "\\b(i am|im|i feel|i got|i have got|i have) (stuck|lost|confused)\\b", "\\bhow do (i|we|you) play\\b",
  "\\bhelp me\\b(?! (with|to|carry|lift|find|get|open|up|down|across)\\b)",
];
const askedForHelp = (text) => any(HELP_ASKED, text) && !/^(ask|say|tell|shout|call|whisper|yell|answer|reply)\b/.test(text);
const wantsHelp = (text) => askedForHelp(text) || any(GENERIC.help, text);

export async function sceneTurn(pack, vs, raw, ai) {
  const run = vs.run;
  const text = norm(raw);
  voicesFor(pack, run);
  const scene = pack.scenes[run.scene];
  run.here = scene.near || null;
  run.turns++;

  if (!text) return flat(say(fill(nth(scene.unclear, 0) || pack.scene.unclear, run)));
  if (any(pack.leave, text)) { vs.mode = "chat"; return flat(stepsOf(pack.scene.leave, run)); }
  if (wantsHelp(text)) return perform(pack, vs, run, scene, { kind: "help" });

  let r = matchScene(pack, run, scene, text, raw);
  if (!r && ai) r = await interpret(pack, run, scene, raw, ai);
  if (!r && any(GENERIC.inspect, text)) r = { kind: "look" }; // looking at something unnamed: the scene itself
  if (!r) r = { kind: "unclear" };
  return perform(pack, vs, run, scene, r);
}

function matchScene(pack, run, scene, text, raw) {
  // 1. the scene's own actions (moves, approaches, commitments)
  const acts = (scene.actions || [])
    .map((a) => ({ a, n: any(a.not, text) ? 0 : hit(a.match, text) })).filter((x) => x.n).sort((x, y) => y.n - x.n);
  if (acts.length) {
    if (acts.length > 1 && acts[0].n === acts[1].n) return { kind: "unclear" };
    return { kind: "act", act: acts[0].a };
  }
  // 2. the voices, where there are voices to ask
  if (scene.voices || scene.near) {
    if (any(GENERIC.recall, text)) return { kind: "recall" };
    const q = (pack.voices.questions || []).find((x) => any(x.match, text));
    if (q || any(GENERIC.ask, text) || any(GENERIC.question, text) || /\?/.test(raw)) return { kind: "ask", q: q || null, path: pathIn(pack, text) };
  }
  // 3. things in the scene, by the sense the visitor used
  const things = (scene.things || []).map((t) => ({ t, n: hit(t.names, text) })).filter((x) => x.n).sort((x, y) => y.n - x.n);
  if (things.length) {
    const sense = any(GENERIC.listen, text) ? "listen" : any(GENERIC.touch, text) ? "touch" : "look";
    return { kind: "thing", thing: things[0].t, sense };
  }
  if (any(GENERIC.look, text)) return { kind: "look" };
  if (any(GENERIC.listen, text)) return { kind: "listen" };
  if (any(GENERIC.back, text)) return { kind: "back" };
  if (any(GENERIC.wait, text)) return { kind: "wait" };
  if (any(GENERIC.inventory, text)) return { kind: "inventory" };
  if (any(GENERIC.recall, text)) return { kind: "recall" };
  return null;
}
function pathIn(pack, text) {
  const ps = Object.entries(pack.voices?.paths || {}).filter(([, p]) => any(p.match, text)).map(([id]) => id);
  if (ps.length === 1) return ps[0];
  if (ps.length > 1 || any(GENERIC.both, text)) return "both";
  return null;
}

// the model gets only this scene, what this run has found, and what can happen from here
async function interpret(pack, run, scene, raw, ai) {
  const intents = [];
  for (const a of scene.actions || []) intents.push({ id: "act:" + a.id, desc: fill(a.desc, run), commit: !!(a.commit || a.ending) });
  for (const t of scene.things || []) intents.push({ id: "thing:" + t.id, desc: "examine, touch or listen to: " + (t.desc || t.id) });
  intents.push({ id: "look", desc: "look around" }, { id: "listen", desc: "listen" },
    { id: "help", desc: "ask what they can do here, what their options are, or for a hint" });
  if (scene.back) intents.push({ id: "back", desc: "go back the way they came" });
  if (scene.voices || scene.near) intents.push({ id: "ask", desc: "say something to, or ask a question of, one or both of the voices" });
  const found = Object.keys(run.seen).map((f) => pack.factText?.[f]).filter(Boolean);
  const out = await ai.interpret({
    voice: pack.prompts?.narrator || "",
    scene: fill(lines(scene.look)[0] || "", run),
    found, intents, input: printable(raw),
  });
  if (!out || typeof out.intent !== "string") return null;
  const id = out.intent;
  if (id === "unclear") return { kind: "unclear" };
  if (id === "freeform") { const s = printable(out.say, 280); return s ? { kind: "freeform", say: s } : null; }
  const known = intents.find((i) => i.id === id);
  if (!known) return null;
  // a commitment (an ending) is never taken on a hunch
  if (known.commit && out.confidence !== "high") return { kind: "unclear" };
  if (id.startsWith("act:")) return { kind: "act", act: scene.actions.find((a) => "act:" + a.id === id) };
  if (id.startsWith("thing:")) return { kind: "thing", thing: scene.things.find((t) => "thing:" + t.id === id), sense: "look" };
  if (id === "ask") {
    const paths = pack.voices.paths || {};
    return { kind: "ask", q: (pack.voices.questions || []).find((q) => q.id === out.topic) || null,
      path: pathIn(pack, norm(raw)) || (Object.hasOwn(paths, out.path) ? out.path : null) };
  }
  return { kind: id };
}

function perform(pack, vs, run, scene, r) {
  switch (r.kind) {
    case "unclear": return flat(say(fill(nth(scene.unclear, bump(run, "unclear")) || pack.scene.unclear, run)));
    case "freeform": return flat(say(r.say));
    case "help": return flat(say(fill(scene.hint || pack.scene.hint, run)));
    case "look": return flat(stepsOf(nth(scene.look, bump(run, run.scene + ":look")), run));
    case "listen": note(run, scene.listenSets); return flat(stepsOf(nth(scene.listen, bump(run, run.scene + ":listen")), run));
    case "wait": return flat(say(fill(scene.wait || pack.scene.wait, run)));
    case "inventory": return flat(say(fill(pack.scene.inventory, run)));
    case "back": return scene.back ? go(pack, run, scene.back, scene.backSay) : flat(say(fill(scene.noBack || pack.scene.noBack, run)));
    case "thing": {
      const t = r.thing;
      note(run, t.set);
      if (r.sense === "listen") note(run, t.listenSets);
      return flat(stepsOf(nth(t[r.sense] || t.look, bump(run, run.scene + ":" + t.id + ":" + r.sense)), run));
    }
    case "recall": {
      if (!run.heard.length) return flat(say(fill(pack.voices.recallNone, run)));
      return flat(run.heard.slice(-4).map((h) => say(pack.voices.recallLine.replace("{voice}", run.voices[h.path].voice).replace("{line}", h.line))));
    }
    case "ask": return ask(pack, run, scene, r);
    case "act": return act(pack, vs, run, scene, r.act);
  }
  return flat(say(pack.scene.unclear));
}

function ask(pack, run, scene, r) {
  const V = pack.voices;
  let path = r.path || scene.near || "both";
  const answer = (p) => {
    const side = p === run.real ? "real" : "false";
    const line = r.q ? r.q[side] : V.fallback[side];
    run.heard.push({ path: p, q: r.q?.id || "other", line }); // which voice said what, on which path
    note(run, ["asked"]);
    return say(V.answerLine.replace("{voice}", run.voices[p].voice).replace("{line}", line));
  };
  if (scene.near && path !== scene.near) {
    if (path === "both") path = scene.near;
    else return flat(say(fill(V.tooFar, run)));
  }
  return path === "both" ? flat(Object.keys(V.paths).map(answer)) : flat(answer(path));
}

function act(pack, vs, run, scene, a) {
  note(run, a.set);
  if (a.commit && scene.near) {
    const ending = scene.near === run.real ? pack.voices.realEnding : pack.voices.falseEnding;
    return flat(stepsOf(a.say, run), end(pack, vs, ending));
  }
  if (a.ending) return flat(stepsOf(a.say, run), end(pack, vs, a.ending));
  if (a.go) return go(pack, run, a.go, a.say);
  return flat(stepsOf(nth(a.say, bump(run, "act:" + a.id)), run));
}

function go(pack, run, to, sayFirst) {
  run.scene = to;
  const next = pack.scenes[to];
  run.here = next.near || null;
  const first = !run.seen["been:" + to];
  run.seen["been:" + to] = true;
  note(run, next.set);
  return flat(stepsOf(sayFirst, run), stepsOf(first ? next.enter : next.again || next.enter, run));
}

/* ---------- endings ---------- */
function end(pack, vs, id) {
  const e = pack.endings[id];
  const run = vs.run;
  learn(vs, ["ended", "ended:" + id]);
  if (e.kind === "bad") {
    vs.mode = "coda";
    vs.coda = { runId: run.id, ending: id };
    return flat(stepsOf(e.steps, run), stepsOf(e.coda, run), stepsOf(pack.coda.ask, run));
  }
  // a good end folds itself, and she asks about something this visitor actually met on the way
  const plane = addPlane(vs, { kind: "good", ending: id, runId: run.id });
  const question = (pack.askAfter || []).find((q) => [].concat(q.requires || []).every((f) => run.seen[f]));
  vs.mode = "chat"; vs.run = null; vs.ended = Date.now();
  return flat(stepsOf(e.steps, run), { fx: { t: "plane", plane: publicPlane(plane) } }, stepsOf(question?.say, run));
}

/* ---------- the closing line after a bad end ---------- */
export async function codaTurn(pack, vs, raw, ai) {
  const C = pack.coda;
  const line = printable(raw, 160);
  const text = norm(line);
  const inv = pack.invite;
  // asking what to do isn't the last line; she says again what she wants, and waits for it
  if (askedForHelp(text)) return flat(stepsOf(C.hint || C.ask, null));
  let kind = !text || any(C.emptyMatch, text) ? "empty"
    : any(inv.match, text) && !any(inv.not, text) ? "invite" : null;
  if (!kind && ai && text.split(" ").length >= 3) {
    const out = await ai.judge({ rule: pack.prompts?.invite || "", line });
    if (out && ["invite", "rude", "ordinary"].includes(out.kind) && !(out.kind === "invite" && any(inv.not, text))) kind = out.kind;
  }
  if (!kind) kind = any(C.rudeMatch, text) ? "rude" : "ordinary";

  const { runId, ending } = vs.coda;
  const plane = addPlane(vs, { kind: "bad", ending, runId, last: kind === "empty" ? "" : line });
  vs.coda = null; vs.run = null; vs.ended = Date.now();
  const fold = { fx: { t: "plane", plane: publicPlane(plane) } };

  if (kind === "invite") {
    vs.mode = "reprise";
    vs.reprise = { step: 1, beats: [] };
    learn(vs, "invited");
    return flat(stepsOf(C.invite, null), fold, stepsOf(pack.reprise.open, null));
  }
  vs.mode = "chat";
  vs.offer = "again";
  return flat(stepsOf(C[kind] || C.ordinary, null), fold, stepsOf(nth(C.after, plane.n - 1), null));
}

/* ---------- the reprise: the visitor tells it, she plays it ---------- */
export async function repriseTurn(pack, vs, raw, ai) {
  const R = pack.reprise;
  const line = printable(raw, MAX_LINE);
  const text = norm(line);
  const rep = vs.reprise;
  if (any(pack.leave, text)) { vs.mode = "chat"; return flat(stepsOf(R.leave, null), { fx: { t: "swap", on: false } }); }
  if (!text || askedForHelp(text)) return flat(stepsOf(nth(R.nudge, rep.step - 1), null));

  if (rep.step <= R.beats) {
    rep.beats.push(line);
    let reply = null;
    if (ai) {
      const out = await ai.improvise({ voice: R.improvise, beats: rep.beats, last: line });
      reply = out ? printable(out, 320) : null;
    }
    if (!reply) reply = echo(nth(R.fallback, rep.step - 1), line);
    const after = nth(R.after, rep.step - 1);
    rep.step++;
    return flat(say(reply), stepsOf(after, null));
  }
  // the last line the visitor writes is someone else's voice; whatever it says, her answer is the same
  vs.mode = "chat"; vs.reprise = null; vs.ended = Date.now();
  learn(vs, R.learn);
  return flat(stepsOf(R.finale, null));
}
// with no model, the answer still answers what was written: the visitor's own words, quoted back
function echo(template, line) {
  const words = line.replace(/"/g, "").split(/\s+/).filter(Boolean);
  const cut = words.length > 16;
  const bit = words.slice(0, 16).join(" ").replace(/[.,;:!?]+$/, "") + (cut ? "..." : "");
  return cut ? template.replace("{quote}.", bit).replace("{quote}", bit) : template.replace("{quote}", bit);
}

/* ---------- ordinary chat: only a few things in it belong to the story ---------- */
export async function chatTurn(pack, vs, raw, ai, rand = Math.random) {
  const text = norm(raw);
  const offer = vs.offer;
  vs.offer = null; // an offer only stands for the very next thing said
  if (!text) return null;
  const eligible = (pack.chat || []).filter((c) =>
    [].concat(c.requires || []).every((f) => vs.facts[f]) &&
    ![].concat(c.unless || []).some((f) => vs.facts[f]) &&
    (!c.offer || c.offer === offer) &&
    (!c.when || (c.when === "suspended" && vs.run) || (c.when === "free" && !vs.run)));
  let pick = eligible.find((c) => any(c.match, text) && !any(c.not, text));
  if (!pick && ai) {
    const maybe = eligible.filter((c) => c.desc && any(c.near, text) && !any(c.not, text));
    if (maybe.length) {
      const out = await ai.chatIntent({ input: printable(raw), intents: maybe.map((c) => ({ id: c.id, desc: c.desc })) });
      pick = maybe.find((c) => c.id === out?.intent) || null;
    }
  }
  if (!pick) return null;
  learn(vs, pick.set);
  if (pick.do === "resume") return resume(pack, vs, "chat");
  if (pick.do === "replay") return start(pack, vs, rand);
  return flat(stepsOf(pick.say, null));
}

/* ---------- starting, resuming, greeting ---------- */
function start(pack, vs, rand) {
  const again = vs.facts.played;
  newRun(pack, vs, rand);
  return flat(stepsOf(again ? pack.origin.again : null, null), stepsOf(pack.origin.ask, null));
}
function resume(pack, vs, why) {
  if (vs.mode === "chat" && vs.run) vs.mode = "scene";
  if (vs.mode === "scene" && vs.run) {
    const run = vs.run;
    voicesFor(pack, run);
    run.here = pack.scenes[run.scene].near || null;
    return flat(stepsOf(why === "chat" ? pack.scene.resume : pack.scene.refresh, run), stepsOf(pack.scenes[run.scene].short, run), stepsOf(pack.origin.ask, run));
  }
  if (vs.mode === "coda") return flat(stepsOf(pack.coda.resume, null));
  if (vs.mode === "reprise") return flat({ fx: { t: "swap", on: true } }, stepsOf(nth(pack.reprise.resume, vs.reprise.step - 1), null));
  return [];
}
// unfolding the first plane: begins a run, resumes a suspended one, and otherwise only shows the paper
export function unfold(pack, vs, rand) {
  if (vs.mode !== "chat") return [];
  if (vs.run) return resume(pack, vs, "chat");
  return start(pack, vs, rand);
}
export function hello(pack, vs, rand, chance) {
  vs.offer = null;
  if (vs.mode !== "chat") return { steps: resume(pack, vs, "refresh") };
  // every visit opens with her greeting; only now and then do her hands slip to the old first word
  if (rand() < chance) { learn(vs, "greeted"); return { steps: stepsOf(pack.greeting, null) }; }
  return { steps: pack.plainGreeting ? stepsOf(pack.plainGreeting, null) : [] };
}

/* ---------- paper: each face is sent only when the visitor turns to it ---------- */
export function paper(pack, vs, id, face) {
  const P = pack.paper;
  if (id === "origin") {
    if (face === "front") return { lines: P.origin.front };
    if (!vs.facts.played) return null;
    learn(vs, "turned:origin");
    return face === "back" ? { lines: P.origin.back, faint: true } : { mirror: P.origin.back, faint: true, lines: P.origin.front };
  }
  const plane = vs.planes.find((p) => p.id === id);
  if (!plane) return null;
  const scrap = P.scraps[plane.scrap] || P.blank;
  if (face === "front") {
    if (plane.kind === "bad") {
      const coda = lines(pack.endings[plane.ending].coda).map((s) => (typeof s === "string" ? s : s.say)).join(" ");
      return { lines: [{ t: coda }].concat(plane.last ? [{ t: plane.last, hand: "visitor" }] : []), note: P.badNote };
    }
    return { lines: P.fronts[plane.ending] || [] };
  }
  learn(vs, scrap.set);
  if (face === "back") return { lines: scrap.lines };
  // held to the light: the back shows through, and so does pencil pressed in from a sheet that once lay on top
  if (plane.kind === "bad") learn(vs, "saw:impression");
  return { mirror: scrap.lines, impression: plane.kind === "bad" ? P.impression : null, lines: paper(pack, vs, id, "front").lines };
}

/* ---------- every scripted sequence in the pack, in order, for the local debug panel only ----------
   (worker/index.js serves this only on a dev server with STORY_DEBUG=1.) A bad end runs on through its closing
   line and an ordinary answer to it, so the scene is seen all the way to where it hands the page back. */
export function cutscenes(pack) {
  const list = [];
  const C = pack.coda || {};
  for (const [id, e] of Object.entries(pack.endings || {})) {
    const steps = e.kind === "bad"
      ? flat(stepsOf(e.steps, null), stepsOf(e.coda, null), stepsOf(C.ask, null), { pause: 1500 }, stepsOf(C.ordinary, null))
      : flat(stepsOf(e.steps, null));
    list.push({ id: "end:" + id, kind: e.kind, steps });
  }
  const R = pack.reprise;
  if (R) {
    const parts = [["open", R.open]].concat(lines(R.after).map((a, i) => ["beat " + (i + 1), a]), [["finale", R.finale], ["leave", R.leave]]);
    for (const [name, s] of parts) if (s) list.push({ id: "reprise:" + name, kind: "reprise", steps: flat(stepsOf(s, null)) });
  }
  return list;
}

/* ---------- what the chat model may know about this visitor ---------- */
export function chatFacts(pack, vs) {
  return (pack.chatFacts || []).filter((f) => [].concat(f.requires).every((x) => vs.facts[x])).map((f) => f.text);
}

/* ---------- one turn, routed by mode; null means "an ordinary chat reply" ---------- */
export async function turn(pack, vs, raw, ai, rand = Math.random) {
  const text = printable(raw, MAX_LINE);
  if (vs.mode === "scene" && vs.run) { vs.offer = null; return { steps: await sceneTurn(pack, vs, text, ai) }; }
  if (vs.mode === "coda" && vs.coda) { vs.offer = null; return { steps: await codaTurn(pack, vs, text, ai) }; }
  if (vs.mode === "reprise" && vs.reprise) { vs.offer = null; return { steps: await repriseTurn(pack, vs, text, ai) }; }
  vs.mode = "chat"; // a state that lost its run goes back to talking
  const steps = await chatTurn(pack, vs, text, ai, rand);
  return steps ? { steps } : null;
}
