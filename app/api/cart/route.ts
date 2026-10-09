import { NextRequest } from "next/server";
import { json, fail, getSessionId } from "@/lib/server";
import { listCart, addToCart, setCartQty, removeCartItem } from "@/lib/queries/engagement";

const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export async function GET() { return json({ items: await listCart(await getSessionId()) }); }

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = int(b.productId);
  if (!id) return fail("Bad product");
  const qty = Math.min(20, int(b.qty) ?? 1);
  const sid = await getSessionId();
  try { await addToCart(sid, id, qty, String(b.size ?? "").slice(0, 40), String(b.color ?? "").slice(0, 60)); } catch { return fail("Unknown product", 404); }
  return json({ items: await listCart(sid) });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = int(b.id), qty = int(b.qty);
  if (!id || !qty) return fail("Bad request");
  const sid = await getSessionId();
  await setCartQty(sid, id, Math.min(20, qty));
  return json({ items: await listCart(sid) });
}

export async function DELETE(req: NextRequest) {
  const id = int(req.nextUrl.searchParams.get("id"));
  if (!id) return fail("Bad request");
  const sid = await getSessionId();
  await removeCartItem(sid, id);
  return json({ items: await listCart(sid) });
}
