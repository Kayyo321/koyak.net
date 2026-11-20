/* One Durable Object per visitor (keyed by an opaque, HttpOnly cookie). It owns that visitor's story state,
   so the page only ever says what the visitor typed or touched, and the server decides what happens.
   Requests are handled strictly one at a time, and every turn carries an id from the page: a retried or
   doubled submission gets the reply the first one got instead of happening twice. */
import { DurableObject } from "cloudflare:workers";
import { loadPack } from "./pack.js";
import { makeAI } from "./ai.js";
import * as E from "./engine.js";

export class Visitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.chain = Promise.resolve();
  }
  serial(fn) {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => {});
    return p;
  }
  async state() {
    const vs = (await this.ctx.storage.get("vs")) || E.freshVisitor();
    return structuredClone(vs); // work on a copy: a turn that throws leaves the stored state untouched
  }
  async commit(vs) { await this.ctx.storage.put("vs", vs); }

  out(pack, vs, steps) {
    return { steps, reply: E.replyText(steps), mode: vs.mode, planes: E.listPlanes(pack, vs) };
  }

  hello({ chance }) {
    return this.serial(async () => {
      const pack = await loadPack(this.env);
      if (!pack) return { arg: false };
      const vs = await this.state();
      const { steps } = E.hello(pack, vs, Math.random, chance ?? pack.greetChance ?? 0.05);
      await this.commit(vs);
      return { arg: true, ...this.out(pack, vs, steps) };
    });
  }

  turn({ text, turnId, aiAllowed }) {
    return this.serial(async () => {
      const pack = await loadPack(this.env);
      if (!pack) return { normal: true, facts: [] };
      const vs = await this.state();
      const seen = E.recalled(vs, turnId);
      if (seen) return seen;
      const r = await E.turn(pack, vs, text, makeAI(this.env, { allowed: aiAllowed }));
      const out = r ? { story: true, ...this.out(pack, vs, r.steps) } : { normal: true, facts: E.chatFacts(pack, vs) };
      E.remember(vs, turnId, out);
      await this.commit(vs);
      return out;
    });
  }

  unfold({ id }) {
    return this.serial(async () => {
      const pack = await loadPack(this.env);
      if (!pack) return null;
      const vs = await this.state();
      if (id !== "origin") {
        const sheet = E.paper(pack, vs, id, "front");
        if (!sheet) return null;
        await this.commit(vs);
        return { sheet, steps: [], mode: vs.mode, planes: E.listPlanes(pack, vs) };
      }
      const steps = E.unfold(pack, vs, Math.random);
      const sheet = E.paper(pack, vs, "origin", "front");
      await this.commit(vs);
      return { sheet, ...this.out(pack, vs, steps) };
    });
  }

  paper({ id, face }) {
    return this.serial(async () => {
      const pack = await loadPack(this.env);
      if (!pack) return null;
      const vs = await this.state();
      const sheet = E.paper(pack, vs, id, face);
      if (sheet) await this.commit(vs);
      return sheet;
    });
  }
}
