import { AdminProducts } from "@/components/admin/AdminProducts";
import { listCategories } from "@/lib/queries/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Products" };
export default async function Page() { return <AdminProducts categories={await listCategories()} />; }
