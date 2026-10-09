import { query, queryOne, execute } from "../db";

export interface Category { id: number; name: string; slug: string }
export interface Subcategory { id: number; category_id: number; name: string; slug: string }
export interface Brand { id: number; name: string; slug: string }

export const listCategories = () => query<Category>("SELECT id, name, slug FROM categories ORDER BY id");
export const listSubcategories = () => query<Subcategory>("SELECT id, category_id, name, slug FROM subcategories ORDER BY id");
export const listBrands = () => query<Brand>("SELECT id, name, slug FROM brands ORDER BY name");
export const getBrandById = (id: number) => queryOne<Brand>("SELECT id, name, slug FROM brands WHERE id = ?", [id]);

/** Find a brand by name or create it. */
export async function ensureBrand(name: string): Promise<number> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const found = await queryOne<{ id: number }>("SELECT id FROM brands WHERE slug = ?", [slug]);
  if (found) return found.id;
  const res = await execute("INSERT INTO brands (name, slug) VALUES (?, ?)", [name, slug]);
  return res.insertId;
}
