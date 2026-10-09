import { NextRequest } from "next/server";
import { json, intParam } from "@/lib/server";
import { listProducts, type ProductFilters } from "@/lib/queries/products";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => { const v = sp.get(k); return v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  const sort = sp.get("sort");
  const f: ProductFilters = {
    category: sp.get("category") || undefined,
    sub: sp.get("sub") || undefined,
    brands: sp.get("brands")?.split(",").filter(Boolean).slice(0, 20),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    minRating: num("minRating"),
    onSale: sp.get("onSale") === "1",
    q: sp.get("q")?.trim().slice(0, 80) || undefined,
    sort: (["newest", "price_asc", "price_desc", "rating"].includes(sort ?? "") ? sort : "newest") as ProductFilters["sort"],
    page: intParam(sp.get("page"), 1, 1, 1000),
    pageSize: intParam(sp.get("pageSize"), 12, 1, 60),
    ids: sp.get("ids")?.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50),
  };
  const { items, total } = await listProducts(f);
  return json({ items, total, page: f.page, pageSize: f.pageSize, pages: Math.ceil(total / (f.pageSize ?? 12)) });
}
