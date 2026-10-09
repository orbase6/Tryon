import { NextRequest } from "next/server";
import { json } from "@/lib/server";
import { query } from "@/lib/db";

/** Brands that have published products, optionally limited to a category slug. */
export async function GET(req: NextRequest) {
  const cat = req.nextUrl.searchParams.get("category");
  const params: unknown[] = [];
  let where = "p.is_published = 1";
  if (cat) { where += " AND c.slug = ?"; params.push(cat); }
  const rows = await query(
    `SELECT DISTINCT b.id, b.name, b.slug FROM brands b JOIN products p ON p.brand_id = b.id
     JOIN categories c ON c.id = p.category_id WHERE ${where} ORDER BY b.name`, params);
  return json({ brands: rows });
}
