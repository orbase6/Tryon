import { NextRequest } from "next/server";
import { json, getSessionId } from "@/lib/server";
import { listLookbook } from "@/lib/queries/products";
import { listGalleryResults } from "@/lib/queries/tryon";
import { getProductsByIds } from "@/lib/queries/products";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const sid = await getSessionId();
  const [lookbook, results] = await Promise.all([listLookbook(category), listGalleryResults(sid)]);
  // resolve product info for the saved try-ons (first product drives category filtering + actions)
  const ids = [...new Set(results.flatMap((r) => r.product_ids))];
  const prods = await getProductsByIds(ids);
  const byId = new Map(prods.map((p) => [p.id, p]));
  const tryons = results
    .map((r) => ({ ...r, products: r.product_ids.map((i) => byId.get(i)).filter(Boolean).map((p) => ({ id: p!.id, name: p!.name, slug: p!.slug, category_slug: p!.category_slug })) }))
    .filter((r) => !category || r.products.some((p) => p.category_slug === category));
  return json({ lookbook, tryons });
}
