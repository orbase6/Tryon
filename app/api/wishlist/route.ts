import { NextRequest } from "next/server";
import { json, fail, getSessionId } from "@/lib/server";
import { listWishlistIds, addWishlist, removeWishlist } from "@/lib/queries/engagement";

const pid = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export async function GET() { return json({ ids: await listWishlistIds(await getSessionId()) }); }

export async function POST(req: NextRequest) {
  const id = pid((await req.json().catch(() => ({}))).productId);
  if (!id) return fail("Bad product");
  const sid = await getSessionId();
  try { await addWishlist(sid, id); } catch { return fail("Unknown product", 404); }
  return json({ ids: await listWishlistIds(sid) });
}

export async function DELETE(req: NextRequest) {
  const id = pid(req.nextUrl.searchParams.get("productId"));
  if (!id) return fail("Bad product");
  const sid = await getSessionId();
  await removeWishlist(sid, id);
  return json({ ids: await listWishlistIds(sid) });
}
