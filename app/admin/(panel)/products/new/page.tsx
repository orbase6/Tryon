import { ProductForm } from "@/components/admin/ProductForm";
import { listBrands, listCategories, listSubcategories } from "@/lib/queries/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · New product" };
export default async function Page() {
  const [categories, subcategories, brands] = await Promise.all([listCategories(), listSubcategories(), listBrands()]);
  return <ProductForm categories={categories} subcategories={subcategories} brands={brands} />;
}
