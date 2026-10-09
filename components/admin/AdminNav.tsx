"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Plus, Store } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AdminNav() {
  const path = usePathname();
  const router = useRouter();
  const out = async () => { await api("/api/admin/logout", { method: "POST" }); router.replace("/admin/login"); router.refresh(); };
  return (
    <nav className="ml-auto flex items-center gap-1.5" aria-label="Admin">
      <Link href="/admin/products" className={cn("btn-ghost !px-3 sm:!px-4", path === "/admin/products" && "!border-brand text-brand")}>Products</Link>
      <Link href="/admin/products/new" className={cn("btn-primary !px-3 sm:!px-4", path === "/admin/products/new" && "ring-2 ring-fg/30")}><Plus className="h-4 w-4" /><span className="hidden sm:inline">New product</span></Link>
      <Link href="/shop" className="icon-btn" aria-label="View store" target="_blank"><Store className="h-5 w-5" /></Link>
      <button className="icon-btn" aria-label="Log out" onClick={out}><LogOut className="h-5 w-5" /></button>
    </nav>
  );
}
