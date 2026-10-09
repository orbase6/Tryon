import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { listBrands, listCategories, listSubcategories } from "@/lib/queries/catalog";
import { getProductById } from "@/lib/queries/products";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Edit product" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const product = Number.isInteger(id) ? await getProductById(id) : null;
  if (!product) notFound();
  const [categories, subcategories, brands] = await Promise.all([listCategories(), listSubcategories(), listBrands()]);
  return <ProductForm categories={categories} subcategories={subcategories} brands={brands} product={product} />;
}
