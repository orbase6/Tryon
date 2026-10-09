import { NextRequest } from "next/server";
import { json, fail, requireAdmin } from "@/lib/server";
import { getProductById, updateProduct, deleteProduct, slugExists, replaceImages, listImages } from "@/lib/queries/products";
import { parseProductInput, ValidationError } from "@/lib/productInput";
import { buildImageRows, readProductBody } from "@/lib/adminProducts";
import { removeByUrl } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };
const pid = async (ctx: Ctx) => { const n = Number((await ctx.params).id); return Number.isInteger(n) && n > 0 ? n : null; };

export async function GET(_r: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin(); if (denied) return denied;
  const id = await pid(ctx); if (!id) return fail("Bad id");
  const p = await getProductById(id);
  return p ? json(p) : fail("Not found", 404);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin(); if (denied) return denied;
  const id = await pid(ctx); if (!id) return fail("Bad id");
  try {
    const existing = await getProductById(id);
    if (!existing) return fail("Not found", 404);
    const body = await readProductBody(req);
    const { input, images, categorySlug } = await parseProductInput(body.data);
    if (await slugExists(input.slug, id)) return fail("Slug already in use", 409);
    const old = await listImages(id);
    const rows = await buildImageRows(images, body.files, categorySlug, old);
    await updateProduct(id, input);
    await replaceImages(id, rows);
    // remove files of images that were replaced / dropped
    const keep = new Set(rows.flatMap((r) => [r.original_path, r.enhanced_path, r.thumb_path]));
    for (const o of old) for (const u of [o.original_path, o.enhanced_path, o.thumb_path]) if (!keep.has(u)) await removeByUrl(u);
    return json({ id, slug: input.slug });
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message, 422);
    console.error(e);
    return fail("Could not update product", 500);
  }
}

export async function DELETE(_r: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin(); if (denied) return denied;
  const id = await pid(ctx); if (!id) return fail("Bad id");
  const imgs = await listImages(id);
  await deleteProduct(id);
  for (const i of imgs) for (const u of [i.original_path, i.enhanced_path, i.thumb_path]) await removeByUrl(u);
  return json({ ok: true });
}
