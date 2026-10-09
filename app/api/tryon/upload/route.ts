import { NextRequest } from "next/server";
import sharp from "sharp";
import { json, fail, getSessionId, clientIp } from "@/lib/server";
import { rateLimit } from "@/lib/rateLimit";
import { randomId, saveFile } from "@/lib/storage";
import { insertTryOnSession } from "@/lib/queries/tryon";
import { cleanupExpired } from "@/lib/tryon/cleanup";
import type { Analysis, LM } from "@/lib/tryon/types";

export const maxDuration = 60;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1600;

const clean = (arr: unknown, max: number): LM[] | null => {
  if (!Array.isArray(arr)) return null;
  const out = arr.slice(0, max).map((l) => {
    const o = l as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return { x: n(o.x), y: n(o.y), z: n(o.z), v: typeof o.v === "number" ? o.v : 1 };
  });
  return out.length ? out : null;
};

export async function POST(req: NextRequest) {
  const sid = await getSessionId();
  const rl = rateLimit(`tryon-upload:${sid}:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return fail(`Too many uploads. Try again in ${rl.retryAfter}s`, 429);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 25 * 1024 * 1024) return fail("Upload too large", 413);

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) return fail("Photo is required");
  if (photo.size > MAX_BYTES) return fail("Photo must be 10 MB or smaller", 413);

  const buf = Buffer.from(await photo.arrayBuffer());
  let meta;
  try { meta = await sharp(buf).metadata(); } catch { return fail("Unreadable image", 415); }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return fail("Only JPG, PNG or WebP photos are allowed", 415);
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) return fail("Photo is too small (min 200px)", 422);

  // Normalise once (EXIF rotation + size cap). Every later render is pixel-locked to THIS image.
  const { data: png, info } = await sharp(buf).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).removeAlpha().png().toBuffer({ resolveWithObject: true });

  let analysis: Analysis | null = null;
  try {
    const raw = JSON.parse(String(form?.get("analysis") ?? "null"));
    if (raw) {
      analysis = {
        width: info.width, height: info.height,
        pose: clean(raw.pose, 33), face: clean(raw.face, 478),
        hands: (Array.isArray(raw.hands) ? raw.hands : []).slice(0, 2).map((h: { handedness?: string; landmarks?: unknown }) => ({ handedness: String(h.handedness ?? ""), landmarks: clean(h.landmarks, 21) ?? [] })).filter((h: { landmarks: LM[] }) => h.landmarks.length === 21),
      };
    }
  } catch { analysis = null; }

  const id = randomId(10);
  const photoUrl = await saveFile(`tryon/photos/${id}.png`, png);
  let maskUrl: string | null = null;
  const parsing = form?.get("parsing");
  if (parsing instanceof File && parsing.size > 0 && parsing.size < 2 * 1024 * 1024) {
    try {
      const m = await sharp(Buffer.from(await parsing.arrayBuffer())).removeAlpha().greyscale().png().toBuffer();
      maskUrl = await saveFile(`tryon/photos/${id}-parsing.png`, m);
    } catch { /* optional */ }
  }
  await insertTryOnSession(id, sid, photoUrl, analysis, maskUrl);
  cleanupExpired().catch(() => {});
  return json({ sessionId: id, photoUrl, width: info.width, height: info.height, analyzed: !!analysis, hasFace: !!analysis?.face, hasPose: !!analysis?.pose });
}
