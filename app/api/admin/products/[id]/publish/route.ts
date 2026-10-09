import { NextRequest } from "next/server";
import { json, fail, requireAdmin } from "@/lib/server";
import { setPublished } from "@/lib/queries/products";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(); if (denied) return denied;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return fail("Bad id");
  const body = await req.json().catch(() => ({}));
  await setPublished(id, !!body.published);
  return json({ ok: true, published: !!body.published });
}
