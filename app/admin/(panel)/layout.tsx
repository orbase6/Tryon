import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/admin/products" className="flex items-center gap-2 font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-black">A</span><span className="hidden sm:inline">Atelier Admin</span></Link>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
