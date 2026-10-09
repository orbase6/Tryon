// Try-on orchestrator: mask-based editing + pixel-lock compositing + face safety check.
//
//   1. parse person (segment.ts / landmarks)           -> garment mask / makeup masks / accessory footprints
//   2. garment: AI adapter edits ONLY the masked area   -> composite into the original with a feathered edge
//   3. makeup + accessories: deterministic landmark layers
//   4. every pixel outside the union of edit masks is copied from the ORIGINAL upload (verified at the end)
//   5. face-diff safety check on the model output (retry once) and on the final image
import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Analysis, Parsing, RenderPick } from "./types";
import { loadSurface, surfaceToPng, compositeCandidate, loadRaw, regionDiff, type Surface } from "./canvas";
import { buildGarmentMask, faceBox } from "./garmentMask";
import { pngGray } from "./raster";
import { renderGarment } from "./providers";
import { applyMakeup, MAKEUP_RANK, MakeupError } from "./makeup";
import { applyAccessory, ACCESSORY_RANK, AccessoryError } from "./accessory";
import { readByUrl, resolveSafe } from "../storage";
import { hasTransparency, heuristicCutout } from "../cutout";

export class TryOnError extends Error {}

/** Soften both images before comparing so model resampling noise isn't mistaken for a changed face. */
async function blurred(rgb: Uint8Array, W: number, H: number): Promise<Uint8Array> {
  const out = await sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.length), { raw: { width: W, height: H, channels: 3 } }).blur(2.5).raw().toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.length);
}

export interface RenderInput {
  cacheKey: string;            // try-on session id (garment layers are cached per session + product)
  photo: Buffer;               // normalised user photo (PNG)
  analysis: Analysis | null;
  parsing: Parsing | null;
  picks: RenderPick[];
}
export interface RenderOutput { image: Buffer; demo: boolean; provider: string; faceDiff: number; lockedChanged: number; notes: string[] }

const threshold = () => Number(process.env.FACE_DIFF_THRESHOLD || 14);

async function cutoutFor(url: string): Promise<Buffer> {
  const buf = await readByUrl(url);
  return (await hasTransparency(buf)) ? buf : heuristicCutout(buf);
}

async function loadCache(key: string, s: Surface): Promise<boolean> {
  const full = resolveSafe(`tryon/cache/${key}.png`), fm = resolveSafe(`tryon/cache/${key}.mask.png`);
  if (!full || !fm) return false;
  try {
    const [img, m] = await Promise.all([fs.readFile(full), fs.readFile(fm)]);
    s.work.set(await loadRaw(img, s.W, s.H));
    const mm = await sharp(m).greyscale().raw().toBuffer();
    s.edit.set(new Uint8Array(mm.buffer, mm.byteOffset, s.W * s.H));
    return true;
  } catch { return false; }
}
async function saveCache(key: string, s: Surface) {
  const full = resolveSafe(`tryon/cache/${key}.png`), fm = resolveSafe(`tryon/cache/${key}.mask.png`);
  if (!full || !fm) return;
  await fs.mkdir(resolveSafe("tryon/cache")!, { recursive: true });
  await Promise.all([fs.writeFile(full, await surfaceToPng(s)), fs.writeFile(fm, await pngGray(s.edit, s.W, s.H))]);
}

export async function renderTryOn(input: RenderInput): Promise<RenderOutput> {
  const s = await loadSurface(input.photo);
  const { W, H } = s;
  const a: Analysis = input.analysis ?? { width: W, height: H, pose: null, face: null, hands: [] };
  const notes: string[] = [];
  let demo = false;
  let provider = "none";
  const fb = faceBox(a, input.parsing, W, H);

  const garments = input.picks.filter((p) => p.tryon_type === "garment");
  const makeups = input.picks.filter((p) => p.tryon_type === "face_makeup").sort((x, y) => (MAKEUP_RANK[x.region] ?? 9) - (MAKEUP_RANK[y.region] ?? 9));
  const accessories = input.picks.filter((p) => p.tryon_type === "accessory").sort((x, y) => (ACCESSORY_RANK[x.region] ?? 9) - (ACCESSORY_RANK[y.region] ?? 9));

  // ---- garment (only one garment is worn at a time: the most recent pick) ----
  const g = garments[garments.length - 1];
  if (g) {
    const key = crypto.createHash("sha1").update(`${input.cacheKey}|${g.productId}|${g.frontUrl}|${(process.env.TRYON_PROVIDER || "mock").toLowerCase()}`).digest("hex").slice(0, 24);
    if (await loadCache(key, s)) {
      notes.push("garment-cache");
    } else {
      const { mask, box, approx } = await buildGarmentMask(a, input.parsing, g.region, W, H);
      if (approx) notes.push("Pose not detected — garment placement is approximate. Use a clear full-body photo for best results.");
      const maskPng = await pngGray(mask, W, H);
      const [front, back] = await Promise.all([cutoutFor(g.frontUrl), g.backUrl ? cutoutFor(g.backUrl).catch(() => null) : null]);
      const run = async () => renderGarment({
        person: input.photo, mask: maskPng, garmentFront: front, garmentBack: back, name: g.name, region: g.region, width: W, height: H, maskBox: box,
      });
      let out = await run();
      let cand = await loadRaw(out.image, W, H);
      const origSoft = fb ? await blurred(s.orig, W, H) : s.orig;
      const drift = async (c: Uint8Array) => (fb ? regionDiff(origSoft, await blurred(c, W, H), W, fb, mask) : 0);
      let diff = await drift(cand);
      console.log(`[tryon] model face drift ${diff.toFixed(1)} (limit ${threshold()})`);
      if (diff > threshold()) { // safety check failed -> retry once
        notes.push(`retry (face drift ${diff.toFixed(1)})`);
        out = await run();
        cand = await loadRaw(out.image, W, H);
        diff = await drift(cand);
        if (diff > threshold()) throw new TryOnError("The AI result changed the face too much, so it was rejected. Please try again or use a clearer photo.");
      }
      demo = demo || out.demo;
      provider = out.provider;
      console.log(`[tryon] garment rendered by provider=${out.provider}${out.demo ? " (DEMO)" : ""}`);
      compositeCandidate(s, cand, mask);
      await saveCache(key, s);
    }
  }
  if (garments.length > 1) notes.push("Only one garment can be worn at a time — the latest one is shown.");

  // ---- makeup ----
  for (const m of makeups) {
    try { await applyMakeup(s, a, m.region, m.shade || "#b3122c"); }
    catch (e) { if (e instanceof MakeupError) throw new TryOnError(e.message); throw e; }
  }
  // ---- accessories ----
  for (const acc of accessories) {
    try { await applyAccessory(s, a, acc.region, acc.subcategory, await cutoutFor(acc.frontUrl)); }
    catch (e) { if (e instanceof AccessoryError) throw new TryOnError(e.message); throw e; }
  }

  // ---- pixel-lock verification: nothing outside the edit mask may differ from the original ----
  let changed = 0;
  for (let i = 0; i < s.edit.length; i++) {
    if (s.edit[i]) continue;
    const j = i * 3;
    if (s.work[j] !== s.orig[j] || s.work[j + 1] !== s.orig[j + 1] || s.work[j + 2] !== s.orig[j + 2]) { changed++; s.work[j] = s.orig[j]; s.work[j + 1] = s.orig[j + 1]; s.work[j + 2] = s.orig[j + 2]; }
  }
  const finalDiff = fb ? regionDiff(s.orig, s.work, W, fb, s.edit) : 0;
  if (finalDiff > 1) throw new TryOnError("Face safety check failed on the final image.");
  return { image: await surfaceToPng(s), demo, provider, faceDiff: finalDiff, lockedChanged: changed, notes };
}
