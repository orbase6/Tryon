import { query, queryOne, execute, parseJson } from "../db";
import type { Product } from "../types";

const SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name,
         s.slug AS subcategory_slug, s.name AS subcategory_name,
         b.name AS brand_name, b.slug AS brand_slug,
         (SELECT pi.enhanced_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS cover,
         (SELECT pi.thumb_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS cover_thumb,
         (SELECT pi.enhanced_path FROM product_images pi WHERE pi.product_id = p.id AND pi.view = 'back' ORDER BY pi.id LIMIT 1) AS back_image
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN subcategories s ON s.id = p.subcategory_id
  LEFT JOIN brands b ON b.id = p.brand_id`;

type Row = Omit<Product, "colors" | "sizes" | "shades"> & { colors: unknown; sizes: unknown; shades: unknown };
const hydrate = (r: Row): Product => ({
  ...r,
  colors: parseJson(r.colors, []),
  sizes: parseJson(r.sizes, []),
  shades: parseJson(r.shades, []),
});

export interface ProductFilters {
  category?: string;
  sub?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  onSale?: boolean;
  q?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "rating";
  page?: number;
  pageSize?: number;
  includeDrafts?: boolean;
  published?: "1" | "0" | "";
  ids?: number[];
}

const EFFECTIVE = "COALESCE(p.sale_price, p.price)";
const SORTS: Record<string, string> = {
  newest: "p.created_at DESC, p.id DESC",
  price_asc: `${EFFECTIVE} ASC, p.id ASC`,
  price_desc: `${EFFECTIVE} DESC, p.id ASC`,
  rating: "p.rating DESC, p.rating_count DESC, p.id ASC",
};

export async function listProducts(f: ProductFilters): Promise<{ items: Product[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!f.includeDrafts) where.push("p.is_published = 1");
  if (f.published === "1" || f.published === "0") { where.push("p.is_published = ?"); params.push(Number(f.published)); }
  if (f.category) { where.push("c.slug = ?"); params.push(f.category); }
  if (f.sub) { where.push("s.slug = ?"); params.push(f.sub); }
  if (f.brands?.length) { where.push(`b.slug IN (${f.brands.map(() => "?").join(",")})`); params.push(...f.brands); }
  if (f.minPrice !== undefined) { where.push(`${EFFECTIVE} >= ?`); params.push(f.minPrice); }
  if (f.maxPrice !== undefined) { where.push(`${EFFECTIVE} <= ?`); params.push(f.maxPrice); }
  if (f.minRating) { where.push("p.rating >= ?"); params.push(f.minRating); }
  if (f.onSale) where.push("p.sale_price IS NOT NULL AND p.sale_price < p.price");
  if (f.ids?.length) { where.push(`p.id IN (${f.ids.map(() => "?").join(",")})`); params.push(...f.ids); }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    where.push("(p.name LIKE ? OR b.name LIKE ? OR p.description LIKE ?)");
    params.push(like, like, like);
  }
  const w = where.length ? " WHERE " + where.join(" AND ") : "";
  const pageSize = Math.min(60, Math.max(1, f.pageSize ?? 12));
  const page = Math.max(1, f.page ?? 1);
  const order = SORTS[f.sort ?? "newest"] ?? SORTS.newest;

  const count = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id
     LEFT JOIN subcategories s ON s.id = p.subcategory_id LEFT JOIN brands b ON b.id = p.brand_id${w}`,
    params,
  );
  const rows = await query<Row>(`${SELECT}${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
  return { items: rows.map(hydrate), total: count?.n ?? 0 };
}

export async function getProductBySlug(slug: string, includeDrafts = false): Promise<Product | null> {
  const r = await queryOne<Row>(`${SELECT} WHERE p.slug = ?${includeDrafts ? "" : " AND p.is_published = 1"}`, [slug]);
  if (!r) return null;
  const p = hydrate(r);
  p.images = await listImages(p.id);
  return p;
}

export async function getProductById(id: number): Promise<Product | null> {
  const r = await queryOne<Row>(`${SELECT} WHERE p.id = ?`, [id]);
  if (!r) return null;
  const p = hydrate(r);
  p.images = await listImages(p.id);
  return p;
}

export async function getProductsByIds(ids: number[], includeDrafts = false): Promise<Product[]> {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  const rows = await query<Row>(`${SELECT} WHERE p.id IN (${marks})${includeDrafts ? "" : " AND p.is_published = 1"}`, ids);
  const imgs = await query<import("../types").ProductImage & { product_id: number }>(
    `SELECT id, product_id, view, original_path, enhanced_path, thumb_path, sort_order FROM product_images WHERE product_id IN (${marks}) ORDER BY sort_order, id`,
    ids,
  );
  const map = new Map(rows.map((r) => [r.id, { ...hydrate(r), images: imgs.filter((i) => i.product_id === r.id) }]));
  return ids.map((i) => map.get(i)).filter(Boolean) as Product[];
}

export async function listRelated(productId: number, categoryId: number, limit = 8): Promise<Product[]> {
  const rows = await query<Row>(
    `${SELECT} WHERE p.category_id = ? AND p.id <> ? AND p.is_published = 1 ORDER BY p.rating DESC, p.id LIMIT ?`,
    [categoryId, productId, limit],
  );
  return rows.map(hydrate);
}

export const listImages = (productId: number) =>
  query<import("../types").ProductImage>(
    "SELECT id, view, original_path, enhanced_path, thumb_path, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order, id",
    [productId],
  );

export interface ProductInput {
  category_id: number;
  subcategory_id: number | null;
  brand_id: number | null;
  name: string;
  slug: string;
  description: string;
  price: number;
  sale_price: number | null;
  stock: number;
  rating: number;
  rating_count: number;
  gender: string;
  colors: string[];
  sizes: string[];
  shades: unknown[];
  tryon_type: string;
  tryon_region: string;
  is_published: number;
}

export async function slugExists(slug: string, exceptId?: number): Promise<boolean> {
  const r = await queryOne<{ id: number }>("SELECT id FROM products WHERE slug = ? AND id <> ?", [slug, exceptId ?? 0]);
  return !!r;
}

export async function insertProduct(p: ProductInput): Promise<number> {
  const res = await execute(
    `INSERT INTO products (category_id, subcategory_id, brand_id, name, slug, description, price, sale_price, stock,
       rating, rating_count, gender, colors, sizes, shades, tryon_type, tryon_region, is_published)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.category_id, p.subcategory_id, p.brand_id, p.name, p.slug, p.description, p.price, p.sale_price, p.stock,
      p.rating, p.rating_count, p.gender, JSON.stringify(p.colors), JSON.stringify(p.sizes), JSON.stringify(p.shades),
      p.tryon_type, p.tryon_region, p.is_published],
  );
  return res.insertId;
}

export async function updateProduct(id: number, p: ProductInput): Promise<void> {
  await execute(
    `UPDATE products SET category_id=?, subcategory_id=?, brand_id=?, name=?, slug=?, description=?, price=?, sale_price=?,
       stock=?, rating=?, rating_count=?, gender=?, colors=?, sizes=?, shades=?, tryon_type=?, tryon_region=?, is_published=?
     WHERE id = ?`,
    [p.category_id, p.subcategory_id, p.brand_id, p.name, p.slug, p.description, p.price, p.sale_price, p.stock,
      p.rating, p.rating_count, p.gender, JSON.stringify(p.colors), JSON.stringify(p.sizes), JSON.stringify(p.shades),
      p.tryon_type, p.tryon_region, p.is_published, id],
  );
}

export const deleteProduct = (id: number) => execute("DELETE FROM products WHERE id = ?", [id]);
export const setPublished = (id: number, v: boolean) => execute("UPDATE products SET is_published = ? WHERE id = ?", [v ? 1 : 0, id]);

export async function replaceImages(
  productId: number,
  imgs: { view: string; original_path: string; enhanced_path: string; thumb_path: string; sort_order: number }[],
) {
  await execute("DELETE FROM product_images WHERE product_id = ?", [productId]);
  for (const i of imgs) {
    await execute(
      "INSERT INTO product_images (product_id, view, original_path, enhanced_path, thumb_path, sort_order) VALUES (?,?,?,?,?,?)",
      [productId, i.view, i.original_path, i.enhanced_path, i.thumb_path, i.sort_order],
    );
  }
}

/** Gallery lookbook: every storefront image of published products. */
export async function listLookbook(category?: string) {
  const params: unknown[] = [];
  let w = "WHERE p.is_published = 1";
  if (category) { w += " AND c.slug = ?"; params.push(category); }
  return query<{ image_id: number; path: string; thumb: string; view: string; product_id: number; name: string; slug: string; category_slug: string; brand_name: string | null }>(
    `SELECT pi.id AS image_id, pi.enhanced_path AS path, pi.thumb_path AS thumb, pi.view, p.id AS product_id, p.name, p.slug,
            c.slug AS category_slug, b.name AS brand_name
     FROM product_images pi JOIN products p ON p.id = pi.product_id
     JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
     ${w} ORDER BY p.created_at DESC, pi.sort_order, pi.id`,
    params,
  );
}
