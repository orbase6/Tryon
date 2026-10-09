import { slugify } from "./utils";
import { listCategories, listSubcategories, ensureBrand } from "./queries/catalog";
import type { ProductInput } from "./queries/products";

export class ValidationError extends Error {}

const REGIONS: Record<string, Record<string, string>> = {
  clothing: { dresses: "torso_dress", coats: "torso_long", default: "torso" },
  cosmetics: { lipstick: "lips", foundation: "face", blush: "cheeks", eyeliner: "eyeliner", eyeshadow: "eyelids", kajal: "waterline", default: "face" },
  accessories: { watches: "wrist", bracelets: "wrist", glasses: "eyes", earrings: "ears", rings: "finger", bags: "shoulder", caps: "head", default: "wrist" },
};
const TYPES: Record<string, ProductInput["tryon_type"]> = { clothing: "garment", cosmetics: "face_makeup", accessories: "accessory" };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, def: number | null = null) => {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const strList = (v: unknown, max = 30): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim()).filter(Boolean).slice(0, max);

export interface ImageSpec { id?: number; token?: string; useOriginal?: boolean; view: "front" | "back" | "side" | "extra" }

export async function parseProductInput(body: Record<string, unknown>): Promise<{ input: ProductInput; images: ImageSpec[]; categorySlug: string }> {
  const name = str(body.name, 160);
  if (name.length < 2) throw new ValidationError("Name is required");
  const slug = slugify(str(body.slug, 180) || name);
  if (!slug) throw new ValidationError("Invalid slug");

  const cats = await listCategories();
  const cat = cats.find((c) => c.id === num(body.category_id) || c.slug === body.category);
  if (!cat) throw new ValidationError("Choose a category");
  const subs = await listSubcategories();
  const subId = num(body.subcategory_id);
  const sub = subId ? subs.find((s) => s.id === subId && s.category_id === cat.id) : undefined;
  if (subId && !sub) throw new ValidationError("Sub-category does not belong to the category");

  const price = num(body.price);
  if (price === null || price < 0) throw new ValidationError("Valid price is required");
  const sale = num(body.sale_price);
  if (sale !== null && (sale < 0 || sale >= price)) throw new ValidationError("Sale price must be lower than price");
  const rating = num(body.rating, 0)!;
  if (rating < 0 || rating > 5) throw new ValidationError("Rating must be between 0 and 5");

  const brandName = str(body.brand_name, 80);
  const brand_id = brandName ? await ensureBrand(brandName) : num(body.brand_id);

  const region = REGIONS[cat.slug];
  const tryon_region = str(body.tryon_region, 40) || (sub ? region[sub.slug] : undefined) || region.default;

  const shadesRaw = Array.isArray(body.shades) ? body.shades : [];
  const shades = shadesRaw
    .map((s) => ({ name: str((s as { name?: string }).name, 40), hex: str((s as { hex?: string }).hex, 7) }))
    .filter((s) => s.name && /^#[0-9a-f]{6}$/i.test(s.hex));

  const gender = ["women", "men", "unisex"].includes(String(body.gender)) ? String(body.gender) : "unisex";

  const images: ImageSpec[] = (Array.isArray(body.images) ? body.images : []).map((i) => {
    const o = i as ImageSpec;
    if (!["front", "back", "side", "extra"].includes(o.view)) throw new ValidationError("Invalid image view");
    return { id: o.id ? Number(o.id) : undefined, token: o.token ? String(o.token) : undefined, useOriginal: !!o.useOriginal, view: o.view };
  });

  return {
    categorySlug: cat.slug,
    images,
    input: {
      category_id: cat.id, subcategory_id: sub?.id ?? null, brand_id: brand_id ?? null,
      name, slug, description: str(body.description, 5000), price, sale_price: sale,
      stock: Math.max(0, Math.floor(num(body.stock, 0)!)),
      rating, rating_count: Math.max(0, Math.floor(num(body.rating_count, 0)!)),
      gender, colors: strList(body.colors), sizes: strList(body.sizes), shades,
      tryon_type: TYPES[cat.slug], tryon_region,
      is_published: body.is_published === false || body.is_published === 0 || body.is_published === "0" ? 0 : 1,
    },
  };
}
