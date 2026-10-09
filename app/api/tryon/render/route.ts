import { NextRequest } from "next/server";
import { json, fail, getSessionId } from "@/lib/server";
import { rateLimit } from "@/lib/rateLimit";
import { getTryOnSession, insertResult } from "@/lib/queries/tryon";
import { getProductsByIds } from "@/lib/queries/products";
import { readByUrl, saveFile, randomId } from "@/lib/storage";
import { getParsing } from "@/lib/tryon/segment";
import { renderTryOn, TryOnError } from "@/lib/tryon/render";
import type { Analysis, RenderPick } from "@/lib/tryon/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sid = await getSessionId();
  const rl = rateLimit(`tryon-render:${sid}`, 15, 60_000);
  if (!rl.ok) return fail(`Slow down — try again in ${rl.retryAfter}s`, 429);
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" && /^[a-f0-9]{20}$/.test(body.sessionId) ? body.sessionId : null;
  const rawPicks: { productId: number; shade?: string }[] = Array.isArray(body?.picks) ? body.picks.slice(0, 12) : [];
  if (!sessionId) return fail("Upload a photo first");
  const session = await getTryOnSession(sessionId, sid);
  if (!session) return fail("Photo expired — please upload it again", 404);

  const ids = rawPicks.map((p) => Number(p.productId)).filter((n) => Number.isInteger(n) && n > 0);
  const products = await getProductsByIds(ids);
  const picks: RenderPick[] = [];
  for (const rp of rawPicks) {
    const p = products.find((x) => x.id === Number(rp.productId));
    if (!p) continue;
    const front = p.images?.find((i) => i.view === "front") ?? p.images?.[0];
    if (!front) continue;
    const back = p.images?.find((i) => i.view === "back");
    const hex = typeof rp.shade === "string" && /^#[0-9a-f]{6}$/i.test(rp.shade) ? rp.shade : p.shades[0]?.hex;
    picks.push({
      productId: p.id, name: p.name, tryon_type: p.tryon_type, region: p.tryon_region, subcategory: p.subcategory_slug,
      shade: hex, frontUrl: front.enhanced_path, backUrl: back?.enhanced_path ?? null,
    });
  }
  const photoUrl = session.user_photo_path;
  const photo = await readByUrl(photoUrl);
  let out;
  try {
    const analysis = session.analysis as Analysis | null;
    const meta = await (await import("sharp")).default(photo).metadata();
    const parsing = await getParsing({ maskUrl: session.mask_path, photo, width: meta.width!, height: meta.height! });
    if (!picks.length) {
      return json({ resultId: null, url: photoUrl, demo: false, notes: [] });
    }
    out = await renderTryOn({ cacheKey: sessionId, photo, analysis, parsing, picks });
  } catch (e) {
    if (e instanceof TryOnError) return fail(e.message, 422);
    console.error("[tryon] render failed", e);
    return fail((e as Error).message || "Render failed", 500);
  }
  const url = await saveFile(`tryon/results/${randomId(10)}.png`, out.image);
  const resultId = await insertResult(sid, picks.map((p) => p.productId), url);
  return json({ resultId, url, demo: out.demo, provider: out.provider, faceDiff: Number(out.faceDiff.toFixed(2)), notes: out.notes });
}
