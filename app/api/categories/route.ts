import { json } from "@/lib/server";
import { listCategories, listSubcategories } from "@/lib/queries/catalog";

export async function GET() {
  const [categories, subcategories] = await Promise.all([listCategories(), listSubcategories()]);
  return json({ categories, subcategories });
}
