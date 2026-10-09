// Human-parsing adapter. SEGMENT_PROVIDER = client | replicate | heuristic
//   client    : browser MediaPipe (selfie multiclass) mask uploaded with the photo -> classes 0..5
//   replicate : server-side human-parsing model returning an ATR/LIP label map
//   heuristic : no parsing available (geometry from pose landmarks only)
import sharp from "sharp";
import { CLS, type Parsing } from "./types";
import { readByUrl } from "../storage";
import { replicateRun, toDataUri, fetchBuffer } from "./providers/replicate";

/** Mask PNGs store class*40 in the grey channel. */
export async function loadClientParsing(maskUrl: string, W: number, H: number): Promise<Parsing | null> {
  try {
    const buf = await readByUrl(maskUrl);
    const { data } = await sharp(buf).removeAlpha().greyscale().resize(W, H, { kernel: "nearest", fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const labels = new Uint8Array(W * H);
    for (let i = 0; i < labels.length; i++) labels[i] = Math.min(5, Math.round(data[i] / 40));
    return { labels, width: W, height: H };
  } catch { return null; }
}

// ATR label map -> internal classes
const ATR: Record<number, number> = { 2: CLS.HAIR, 11: CLS.FACE, 12: CLS.SKIN, 13: CLS.SKIN, 14: CLS.SKIN, 15: CLS.SKIN,
  4: CLS.CLOTHES, 5: CLS.CLOTHES, 6: CLS.CLOTHES, 7: CLS.CLOTHES, 8: CLS.CLOTHES, 17: CLS.CLOTHES,
  1: CLS.OTHER, 3: CLS.OTHER, 9: CLS.OTHER, 10: CLS.OTHER, 16: CLS.OTHER };

async function replicateParsing(photo: Buffer, W: number, H: number): Promise<Parsing | null> {
  const model = process.env.REPLICATE_PARSING_MODEL;
  if (!model || !process.env.REPLICATE_API_TOKEN) return null;
  const out = await replicateRun(model, { image: toDataUri(photo, "image/png") });
  const url = Array.isArray(out) ? out[0] : (out as { mask?: string })?.mask ?? out;
  const { data } = await sharp(await fetchBuffer(String(url))).removeAlpha().greyscale().resize(W, H, { kernel: "nearest", fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const labels = new Uint8Array(W * H);
  for (let i = 0; i < labels.length; i++) labels[i] = ATR[data[i]] ?? CLS.BG;
  return { labels, width: W, height: H };
}

export async function getParsing(opts: { maskUrl: string | null; photo: Buffer; width: number; height: number }): Promise<Parsing | null> {
  const provider = (process.env.SEGMENT_PROVIDER || "client").toLowerCase();
  if (provider === "heuristic") return null;
  if (provider === "replicate") {
    try { const p = await replicateParsing(opts.photo, opts.width, opts.height); if (p) return p; } catch (e) { console.warn("[segment] replicate failed:", (e as Error).message); }
  }
  return opts.maskUrl ? loadClientParsing(opts.maskUrl, opts.width, opts.height) : null;
}
