import { NextRequest } from "next/server";
import { json, fail, requireAdmin, intParam } from "@/lib/server";
import { listProducts, insertProduct, slugExists, replaceImages } from "@/lib/queries/products";
import { parseProductInput, ValidationError } from "@/lib/productInput";
import { buildImageRows, readProductBody } from "@/lib/adminProducts";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const pub = sp.get("published");
  const { items, total } = await listProducts({
    includeDrafts: true,
    category: sp.get("category") || undefined,
    q: sp.get("q")?.trim().slice(0, 80) || undefined,
    published: pub === "1" || pub === "0" ? pub : "",
    page: intParam(sp.get("page"), 1, 1, 1000),
    pageSize: intParam(sp.get("pageSize"), 10, 1, 50),
    sort: "newest",
  });
  return json({ items, total, pages: Math.ceil(total / intParam(sp.get("pageSize"), 10, 1, 50)) });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await readProductBody(req);
    const { input, images, categorySlug } = await parseProductInput(body.data);
    if (await slugExists(input.slug)) return fail("Slug already in use", 409);
    const rows = await buildImageRows(images, body.files, categorySlug, []);
    const id = await insertProduct(input);
    await replaceImages(id, rows);
    return json({ id, slug: input.slug }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message, 422);
    console.error(e);
    return fail("Could not save product", 500);
  }
}
