import type { Metadata } from "next";
import { ShopClient } from "@/components/ShopClient";
import { listProducts } from "@/lib/queries/products";
import { listBrands, listCategories, listSubcategories } from "@/lib/queries/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop" };

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [categories, subcategories, brands] = await Promise.all([listCategories(), listSubcategories(), listBrands()]);
  const category = categories.some((c) => c.slug === sp.category) ? sp.category : undefined;
  const sort = (["newest", "price_asc", "price_desc", "rating"].includes(sp.sort ?? "") ? sp.sort : "newest") as "newest";
  const initial = await listProducts({ category, sub: sp.sub, q: sp.q?.slice(0, 80), sort, pageSize: 12, page: 1 });
  return <ShopClient categories={categories} subcategories={subcategories} brands={brands} initial={{ ...initial, params: { category: category ?? "", sub: sp.sub ?? "", q: sp.q ?? "", sort } }} />;
}
