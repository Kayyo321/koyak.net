/* The story lives in a content pack that is never public.
   - Production / local: pack.sealed.js holds the pack sealed with AES-256-GCM. The key is the Worker secret
     STORY_PACK_KEY (base64, 32 bytes); without it the pack can't be opened and the game simply isn't there.
   - Tests and other developers: STORY_FIXTURE=1 loads fixture.json, a small synthetic story with the same shape.
   The plaintext is kept out of the repository (see STORY.md for sealing and provisioning). */
import { SEALED } from "./pack.sealed.js";
import FIXTURE from "./fixture.json";

let opened = null; // { key, pack } for the life of the isolate

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function openSealed(sealed, keyB64) {
  const raw = b64(keyB64.trim());
  if (raw.length !== 32) throw new Error("STORY_PACK_KEY must be 32 bytes, base64");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64(sealed.iv), additionalData: new TextEncoder().encode("koyak-story-pack/v" + sealed.v) },
    key, b64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function loadPack(env) {
  if (env.STORY_FIXTURE === "1") return FIXTURE;
  const k = env.STORY_PACK_KEY;
  if (!k || !SEALED || !SEALED.ct) return null;
  if (opened && opened.key === k) return opened.pack;
  try {
    const pack = await openSealed(SEALED, k);
    opened = { key: k, pack };
    return pack;
  } catch (e) {
    console.error("story pack: cannot open", String(e).slice(0, 120)); // never the key
    return null;
  }
}
