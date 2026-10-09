// Product image enhancement service.
//   validate -> auto-rotate/normalise -> resize(<=2000) -> upscale/denoise/sharpen (if small or blurry)
//   -> background removal (cutout PNG) -> thumbnail. Providers are swapped through .env.
import sharp from "sharp";
import { removeBackground } from "./cutout";
import { saveFile, randomId } from "./storage";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FORMATS = ["jpeg", "png", "webp"];
const MAX_SIDE = 2000;
const MIN_GOOD_SIDE = 1000;

export class ImageError extends Error {}

export interface EnhanceReport {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  blurScore: number;
  blurry: boolean;
  lowRes: boolean;
  upscaled: boolean;
  sharpened: boolean;
  backgroundRemoved: boolean;
  bgProvider: string;
  upscaleProvider: string;
}

export interface EnhancedImage {
  token: string;
  original_path: string;
  enhanced_path: string;
  thumb_path: string;
  report: EnhanceReport;
}

/** Validate type + size by content (not by filename / client MIME). */
export async function validateImage(buf: Buffer) {
  if (buf.length > MAX_UPLOAD_BYTES) throw new ImageError("Image is larger than 10 MB");
  if (buf.length < 100) throw new ImageError("Empty or corrupt image");
  let meta;
  try { meta = await sharp(buf).metadata(); } catch { throw new ImageError("Unreadable image file"); }
  if (!meta.format || !ALLOWED_FORMATS.includes(meta.format)) throw new ImageError("Only JPG, PNG or WebP images are allowed");
  if (!meta.width || !meta.height) throw new ImageError("Invalid image dimensions");
  if (meta.width * meta.height > 60_000_000) throw new ImageError("Image resolution is too large");
  return meta;
}

/** Variance of a Laplacian-filtered greyscale copy — low value = blurry. */
export async function blurScore(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf).flatten({ background: "#fff" }).greyscale().resize(512, 512, { fit: "inside" })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], scale: 1, offset: 128 })
    .raw().toBuffer({ resolveWithObject: true });
  let sum = 0, sq = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) { const v = data[i] - 128; sum += v; sq += v * v; }
  const mean = sum / n;
  return sq / n - mean * mean;
}

async function upscale(buf: Buffer, targetLong: number): Promise<{ buf: Buffer; provider: string }> {
  const provider = (process.env.UPSCALE_PROVIDER || "sharp").toLowerCase();
  if (provider === "replicate" && process.env.REPLICATE_API_TOKEN) {
    try {
      const { replicateRun, toDataUri } = await import("./tryon/providers/replicate");
      const out = await replicateRun(process.env.REPLICATE_UPSCALE_MODEL || "nightmareai/real-esrgan", {
        image: toDataUri(await sharp(buf).png().toBuffer(), "image/png"), scale: 2, face_enhance: false,
      });
      const url = Array.isArray(out) ? out[0] : out;
      const res = await fetch(String(url));
      if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), provider: "replicate" };
    } catch (e) { console.warn("[upscale] replicate failed, using sharp:", (e as Error).message); }
  }
  const m = await sharp(buf).metadata();
  const scale = targetLong / Math.max(m.width!, m.height!);
  return {
    buf: await sharp(buf).resize(Math.round(m.width! * scale), Math.round(m.height! * scale), { kernel: "lanczos3" }).median(2).sharpen({ sigma: 1.1 }).toBuffer(),
    provider: "sharp",
  };
}

export async function enhanceProductImage(input: Buffer, view: string): Promise<EnhancedImage> {
  const meta = await validateImage(input);
  const token = randomId(10);
  const base = `products/${token}`;

  // 1. normalise orientation, colour space, cap the size
  let work: Buffer = await sharp(input).rotate().toColourspace("srgb").resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).toBuffer();
  const norm = await sharp(work).metadata();
  const hasAlpha = !!norm.hasAlpha;
  const original_path = await saveFile(`${base}-original.${hasAlpha ? "png" : "jpg"}`, hasAlpha ? await sharp(work).png().toBuffer() : await sharp(work).jpeg({ quality: 92 }).toBuffer());

  // 2. analyse
  const long = Math.max(norm.width!, norm.height!);
  const score = await blurScore(work);
  const lowRes = long < MIN_GOOD_SIDE;
  const blurry = score < 60;
  let upscaled = false, sharpened = false, upscaleProvider = "none";

  // 3. upscale / denoise / sharpen
  if (lowRes) {
    const r = await upscale(work, 1400);
    work = r.buf; upscaled = true; upscaleProvider = r.provider;
  }
  if (blurry || lowRes) {
    work = await sharp(work).median(blurry ? 3 : 1).sharpen({ sigma: blurry ? 1.6 : 1.0, m1: 1.2, m2: 2.2 }).modulate({ brightness: 1.02 }).toBuffer();
    sharpened = true;
  }
  // gentle auto-levels for poorly lit shots
  const st = await sharp(work).stats();
  const luma = st.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
  if (luma < 85) work = await sharp(work).normalise().gamma(1.15).toBuffer();

  // 4. background removal -> transparent cutout
  const cut = await removeBackground(work);
  let png: Buffer = cut.png;
  try { // trim empty borders and pad a little so the try-on engine gets a tight garment/accessory crop
    const trimmed = await sharp(png).trim({ threshold: 2 }).toBuffer();
    const tm = await sharp(trimmed).metadata();
    if (tm.width! > 40 && tm.height! > 40 && !cut.skipped) {
      const pad = Math.round(Math.max(tm.width!, tm.height!) * 0.03);
      png = await sharp(trimmed).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
  } catch { /* nothing to trim */ }
  png = await sharp(png).resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  const em = await sharp(png).metadata();
  const enhanced_path = await saveFile(`${base}-enhanced.png`, png);

  // 5. thumbnail (webp, 400px)
  const thumb_path = await saveFile(`${base}-thumb.webp`, await sharp(png).resize(400, 400, { fit: "inside" }).webp({ quality: 82 }).toBuffer());

  await saveFile(`${base}.json`, Buffer.from(JSON.stringify({ view, original_path, enhanced_path, thumb_path })));
  return {
    token, original_path, enhanced_path, thumb_path,
    report: {
      width: em.width!, height: em.height!, sourceWidth: meta.width!, sourceHeight: meta.height!,
      blurScore: Math.round(score), blurry, lowRes, upscaled, sharpened,
      backgroundRemoved: !cut.skipped, bgProvider: cut.provider, upscaleProvider,
    },
  };
}

/** Resolve a staged upload token (created by enhanceProductImage) back to its stored paths. */
export async function resolveStaged(token: string) {
  if (!/^[a-f0-9]{20}$/.test(token)) throw new ImageError("Invalid image token");
  const { readByUrl } = await import("./storage");
  try {
    const j = JSON.parse((await readByUrl(`/api/files/products/${token}.json`)).toString());
    return j as { original_path: string; enhanced_path: string; thumb_path: string };
  } catch { throw new ImageError("Staged image not found — upload it again"); }
}
