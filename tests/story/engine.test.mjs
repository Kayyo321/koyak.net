// Engine checks against the synthetic fixture pack (worker/story/fixture.json). No real story text lives here.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../../worker/story/engine.js";

const pack = JSON.parse(readFileSync(new URL("../../worker/story/fixture.json", import.meta.url)));
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const text = (steps) => E.replyText(steps);
async function play(vs, ...inputs) {
  let last;
  for (const t of inputs) last = await E.turn(pack, vs, t, null);
  return last;
}
function started(real = "a") {
  const vs = E.freshVisitor();
  E.unfold(pack, vs, seq(0, real === "a" ? 0 : 0.9));
  return vs;
}

test("ordinary chat is left alone", async () => {
  const vs = E.freshVisitor();
  assert.equal(await E.turn(pack, vs, "tell me about lighthouses", null), null);
  assert.equal(await E.turn(pack, vs, "halp", null), null, "the typo line needs the greeting first");
  assert.equal(vs.mode, "chat");
});

test("greeting, typo, and the way in", async () => {
  const vs = E.freshVisitor();
  const h = E.hello(pack, vs, () => 0, 1);
  assert.deepEqual(h.steps.map((s) => Object.keys(s)[0]), ["say", "pause", "erase", "type"]);
  assert.equal(text((await E.turn(pack, vs, "you wrote halp", null)).steps), "FIXTURE: typo reply.");
  const job = (await E.turn(pack, vs, "what did you used to do", null)).steps;
  assert.ok(job.some((s) => s.fx?.t === "face") && job.some((s) => s.fx?.t === "nudge"));
  assert.ok(E.chatFacts(pack, vs).includes("FIXTURE FACT: told."));
});

test("without the slip she still greets, plainly, and the typo line stays shut", async () => {
  const vs = E.freshVisitor();
  const h = E.hello(pack, vs, () => 0.5, 0.05);
  assert.equal(text(h.steps), "hello. how may i help?");
  assert.equal(await E.turn(pack, vs, "halp", null), null, "a plain greeting doesn't open the typo line");
});

test("mid-run, hello resumes a run instead", () => {
  const vs = started();
  const h = E.hello(pack, vs, () => 0, 0);
  assert.match(text(h.steps), /FIXTURE: refreshed\. FIXTURE: at the quay\. FIXTURE: what now\?/);
});

test("unfolding starts a run once; ambiguous input does not advance", async () => {
  const vs = E.freshVisitor();
  assert.equal(text(E.unfold(pack, vs, () => 0)), "FIXTURE: what now?");
  assert.equal(vs.mode, "scene");
  assert.deepEqual(E.unfold(pack, vs, () => 0), [], "a second unfold mid-run changes nothing");
  const r = await play(vs, "flibbertigibbet");
  assert.equal(text(r.steps), "FIXTURE: unclear at the quay.");
  assert.equal(vs.run.scene, "quay");
  assert.equal(text((await play(vs, "look")).steps), "FIXTURE: a quay, a stair, a gate.");
  assert.equal(text((await play(vs, "look")).steps), "FIXTURE: still a quay.");
  assert.equal(text((await play(vs, "examine the parcel")).steps), "FIXTURE: a parcel, string-tied.");
  assert.equal(text((await play(vs, "touch the parcel")).steps), "FIXTURE: it ticks.");
});

test("asking what you can do gets this scene's own hint, however it's put", async () => {
  const asks = ["what are my options", "What can I do here?", "what can i do right now", "what's there to do",
    "what should I do", "now what?", "help", "give me a hint", "I'm stuck", "where can I go", "what am I supposed to do"];
  for (const q of asks) {
    const vs = started();
    assert.equal(text((await play(vs, q)).steps), "FIXTURE: stair or gate.", q);
    assert.equal(vs.run.scene, "quay", q + " moves nothing");
  }
  const vs = started();
  await play(vs, "climb the stair");
  assert.equal(text((await play(vs, "what are my options")).steps), "FIXTURE: top or back.", "the hint follows the visitor");
  assert.equal(vs.run.scene, "stair");
  // a question that names something is about that thing, not a request for help
  const w = started();
  assert.equal(text((await play(w, "what can I do with the parcel")).steps), "FIXTURE: a parcel, string-tied.");
});

test("asking what to do after a bad end, or mid-reprise, isn't taken as the visitor's line", async () => {
  const vs = started();
  await play(vs, "stair", "top");
  assert.equal(text((await play(vs, "what are my options")).steps), "FIXTURE: your last line?");
  assert.equal(vs.mode, "coda");
  assert.equal(vs.planes.length, 0, "nothing folded yet");
  await play(vs, "your turn");
  assert.equal(vs.mode, "reprise");
  assert.equal(text((await play(vs, "what should I say")).steps), "FIXTURE: say something.");
  assert.equal(vs.reprise.step, 1, "the reprise waits");
});

test("approach before commit; back out; then commit to a bad end and write a coda", async () => {
  const vs = started();
  await play(vs, "climb the stair");
  assert.equal(vs.run.scene, "stair");
  assert.equal(text((await play(vs, "look at the top")).steps), "FIXTURE: steps up to a lamp room.", "looking is safe");
  await play(vs, "go back");
  assert.equal(vs.run.scene, "quay");
  await play(vs, "stairs");
  const end = await play(vs, "go up to the top");
  assert.equal(vs.mode, "coda");
  assert.ok(end.steps.some((s) => s.fx?.t === "dim"));
  assert.match(text(end.steps), /FIXTURE CODA: the lamp\. FIXTURE: your last line\?$/);
  const fold = await play(vs, "it was worth it");
  assert.equal(vs.mode, "chat");
  assert.equal(vs.planes.length, 1);
  assert.equal(vs.planes[0].last, "it was worth it");
  assert.ok(fold.steps.some((s) => s.fx?.t === "plane"));
});

test("doors: questions are tracked per path; the real door is a good end, the false one bad", async () => {
  for (const real of ["a", "b"]) {
    const vs = started(real);
    await play(vs, "go through the gate");
    const both = text((await play(vs, "what is in the parcel?")).steps);
    const want = real === "a" ? ["real", "false"] : ["false", "real"];
    assert.equal(both, `The red voice: 'FIXTURE-${want[0].toUpperCase()}: ${want[0] === "real" ? "you packed it." : "a guess."}' The blue voice: 'FIXTURE-${want[1].toUpperCase()}: ${want[1] === "real" ? "you packed it." : "a guess."}'`);
    assert.match(text((await play(vs, "what did they say")).steps), /^The red voice said/);
    await play(vs, real === "a" ? "red" : "blue");
    const good = await play(vs, "open the door");
    assert.equal(vs.mode, "chat");
    assert.ok(good.steps.some((s) => s.fx?.t === "plane"));
    assert.match(text(good.steps), /did the doors frighten you\?$/);

    const vs2 = started(real);
    await play(vs2, "gate", real === "a" ? "blue" : "red");
    await play(vs2, "open it");
    assert.equal(vs2.mode, "coda", "the false door is a bad end");
  }
});

test("good end asks about something actually met", async () => {
  const vs = started("a");
  await play(vs, "stair", "back", "gate", "red");
  const r = await play(vs, "open");
  assert.match(text(r.steps), /did the hum frighten you\?$/);
});

test("planes are saved exactly once, even when the coda turn is retried", async () => {
  const vs = started();
  await play(vs, "stair", "top");
  const before = structuredClone(vs);
  const once = await E.turn(pack, vs, "first", null);
  E.remember(vs, "turn-abc12345", once);
  assert.deepEqual(E.recalled(vs, "turn-abc12345"), once);
  // a second run of the same finishing turn on the old state still yields one plane for that run
  const replayed = before;
  await E.turn(pack, replayed, "first", null);
  assert.equal(replayed.planes.length, 1);
  assert.equal(vs.planes.length, 1);
});

test("replay keeps the collection; a bare yes only counts right after the offer", async () => {
  const vs = started();
  await play(vs, "stair", "top", "kept line");
  assert.equal(vs.offer, "again");
  assert.match(text((await play(vs, "yes")).steps), /FIXTURE: again from the quay\./);
  assert.equal(vs.mode, "scene");
  await play(vs, "stair", "top", "second line");
  assert.equal(vs.planes.length, 2);
  await play(vs, "tell me about boats"); // the offer lapses
  assert.equal(await E.turn(pack, vs, "yes", null), null);
  assert.ok((await play(vs, "play again")).steps.length);
});

test("leave and resume", async () => {
  const vs = started();
  await play(vs, "stair");
  assert.match(text((await play(vs, "leave")).steps), /left the story/);
  assert.equal(vs.mode, "chat");
  assert.equal(await E.turn(pack, vs, "nice weather", null), null);
  assert.match(text((await play(vs, "resume")).steps), /FIXTURE: resumed\. FIXTURE: on the stair\./);
  assert.equal(vs.mode, "scene");
  assert.equal(vs.run.scene, "stair");
  E.turn(pack, vs, "leave", null);
  assert.match(text(E.unfold(pack, vs, () => 0)), /resumed/);
});

test("the invitation: a closing line can hand over the next bit, without a password", async () => {
  for (const line of ["your turn", "this time you take the parcel"]) {
    const vs = started();
    await play(vs, "stair", "top");
    const r = await play(vs, line);
    assert.equal(vs.mode, "reprise", line);
    assert.ok(r.steps.some((s) => s.fx?.t === "swap" && s.fx.on));
    assert.equal(vs.planes.length, 1, "the plane is still kept");
  }
  const vs = started();
  await play(vs, "stair", "top");
  await play(vs, "it is not your turn");
  assert.equal(vs.mode, "chat", "a negated line is an ordinary line");
});

test("the reprise answers what was written, with no model, and is remembered", async () => {
  const vs = started();
  await play(vs, "stair", "top", "your turn");
  assert.equal(text((await play(vs, "")).steps), "FIXTURE: say something.", "empty input does not advance");
  const a = text((await play(vs, "a heron blocks the way")).steps);
  assert.equal(a, "FIXTURE ECHO 1: a heron blocks the way. FIXTURE REPRISE: past it. What next?");
  await play(vs, "then rain");
  const fin = await play(vs, "you are late");
  assert.ok(fin.steps.some((s) => s.fx?.t === "face" && s.fx.cue === "smile"));
  assert.equal(vs.mode, "chat");
  assert.ok(vs.facts.carried);
  assert.equal(text((await play(vs, "what do you do for fun")).steps), "FIXTURE: fun memory.");
  assert.ok(E.chatFacts(pack, vs).includes("FIXTURE FACT: carried."));
});

test("a model that fails, lies or overreaches changes nothing it shouldn't", async () => {
  const liar = { interpret: async () => ({ intent: "act:top", confidence: "low", say: "", topic: "", path: "" }) };
  const vs = started();
  await play(vs, "stair");
  const r = await E.turn(pack, vs, "hmm maybe", liar);
  assert.equal(vs.mode, "scene", "a low-confidence commitment is not taken");
  assert.equal(text(r.steps), "FIXTURE: top or back?");
  const bogus = { interpret: async () => ({ intent: "act:nonexistent", confidence: "high" }) };
  await E.turn(pack, vs, "do the thing", bogus);
  assert.equal(vs.run.scene, "stair");
  const broken = { interpret: async () => null, judge: async () => null, improvise: async () => null, chatIntent: async () => null };
  await E.turn(pack, vs, "top", broken);
  assert.equal(vs.mode, "coda");
  await E.turn(pack, vs, "your turn", broken);
  assert.equal(vs.mode, "reprise");
  const r2 = await E.turn(pack, vs, "a goose", broken);
  assert.match(text(r2.steps), /^FIXTURE ECHO 1: a goose\./);
  const free = { interpret: async () => ({ intent: "freeform", confidence: "high", say: "You hum <b>quietly</b>.", topic: "", path: "" }) };
  const vs3 = started();
  assert.equal(text((await E.turn(pack, vs3, "hum a tune", free)).steps), "You hum bquietly/b.", "markup is stripped");
});

test("chat: the model may pick one of the eligible intents, and only those", async () => {
  const vs = E.freshVisitor();
  E.hello(pack, vs, () => 0, 1);
  let asked = null;
  const ai = { chatIntent: async ({ intents }) => { asked = intents.map((i) => i.id); return { intent: "typo" }; } };
  const r = await E.turn(pack, vs, "that halp of yours", ai);
  assert.equal(text(r.steps), "FIXTURE: typo reply.", "a deterministic match never needs the model");
  const r2 = await E.turn(pack, vs, "about that typo thing earlier, odd", { chatIntent: async () => ({ intent: "lore" }) });
  assert.equal(text(r2.steps), "FIXTURE: typo reply.");
  const vs2 = E.freshVisitor();
  E.hello(pack, vs2, () => 0, 1);
  const r3 = await E.turn(pack, vs2, "i wonder what used to be", { chatIntent: async ({ intents }) => { asked = intents.map((i) => i.id); return { intent: "job" }; } });
  assert.equal(r3, null, "an intent that isn't eligible yet is ignored, whatever the model says");
  assert.ok(!asked || !asked.includes("job"));
});

test("paper: faces are sent only for planes the visitor owns", async () => {
  const vs = E.freshVisitor();
  assert.deepEqual(E.paper(pack, vs, "origin", "front").lines[0].t, "FIXTURE ORIGIN FRONT.");
  assert.equal(E.paper(pack, vs, "origin", "back"), null, "the back waits until the story has begun");
  assert.equal(E.paper(pack, vs, "p1", "front"), null);
  E.unfold(pack, vs, () => 0);
  assert.equal(E.paper(pack, vs, "origin", "back").lines[0].t, "FIXTURE ORIGIN RULE.");
  await play(vs, "stair", "top", "kept");
  const f = E.paper(pack, vs, "p1", "front");
  assert.equal(f.note, "FIXTURE NOTE.");
  assert.deepEqual(f.lines.map((l) => l.t), ["FIXTURE CODA: the lamp.", "kept"]);
  assert.equal(E.paper(pack, vs, "p1", "back").lines[0].t, "FIXTURE SCRAP ONE.");
  assert.equal(E.paper(pack, vs, "p1", "light").impression, "FIXTURE IMPRESSION.");
  await play(vs, "play again", "stair", "top", "two");
  E.paper(pack, vs, "p2", "back");
  assert.ok(vs.facts["knows:lore"], "reading a scrap teaches the chat what it says");
  assert.equal(text((await play(vs, "tell me the lore")).steps), "FIXTURE: lore reply.");
});

test("normalising what people type", () => {
  assert.equal(E.norm("What's in the PARCEL?!"), "what is in the parcel");
  assert.equal(E.norm("I don't know"), "i do not know");
  assert.equal(E.printable("“Hi” — there…"), '"Hi" - there...');
});

test("cutscenes: every ending and every scripted part of the reprise, in order (local debug panel only)", () => {
  const list = E.cutscenes(pack);
  const ids = list.map((c) => c.id);
  for (const id of Object.keys(pack.endings)) assert.ok(ids.includes("end:" + id), id);
  assert.ok(ids.includes("reprise:open") && ids.includes("reprise:finale"));
  const bad = list.find((c) => c.kind === "bad");
  assert.match(text(bad.steps), /FIXTURE: your last line\?/, "a bad end runs on through its closing line");
  assert.ok(list.every((c) => c.steps.length && c.steps.every((s) => s && typeof s === "object")));
});
