import { NextRequest } from "next/server";
import { json, fail } from "@/lib/server";
import { getProductBySlug } from "@/lib/queries/products";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = await getProductBySlug(slug);
  return p ? json(p) : fail("Not found", 404);
}
