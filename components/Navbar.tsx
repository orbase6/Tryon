"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Heart, Menu, Moon, Search, ShoppingBag, Sun, X } from "lucide-react";
import { useStore } from "./StoreProvider";
import { cn } from "@/lib/utils";

const LINKS = [{ href: "/", label: "Home" }, { href: "/shop", label: "Shop" }, { href: "/gallery", label: "Gallery" }];
const LANGS = [{ code: "EN", label: "English" }]; // UI ready for more locales

export function Navbar() {
  const router = useRouter();
  const path = usePathname();
  const { wishlist, cart, openDrawer } = useStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [lang, setLang] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { setMenu(false); setSearch(false); }, [path]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); router.push(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : "/shop"); setSearch(false); };
  const cartCount = cart.reduce((n, i) => n + i.qty, 0);

  const searchBox = (
    <form onSubmit={submit} role="search" className="relative w-full">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coats, lipstick, watches…" aria-label="Search products" className="input !rounded-full pl-10" />
    </form>
  );
  const Badge = ({ n }: { n: number }) => n > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-black">{n}</span> : null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1800px] items-center gap-3 px-4 md:px-6">
        <Link href="/shop" className="flex items-center gap-2 text-lg font-extrabold tracking-tight" aria-label="Atelier home">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-black">A</span><span className="hidden sm:inline">Atelier</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => {
            const on = l.label === "Gallery" ? path === "/gallery" : l.label === "Home" ? false : path === "/shop";
            return <Link key={l.label} href={l.href} className={cn("rounded-full px-4 py-2 text-sm font-medium transition hover:text-brand", on && "bg-brand/15 text-brand")}>{l.label}</Link>;
          })}
        </nav>
        <div className="mx-4 hidden max-w-md flex-1 lg:block">{searchBox}</div>
        <div className="ml-auto flex items-center gap-2">
          <button className="icon-btn lg:hidden" aria-label="Search" onClick={() => setSearch((s) => !s)}><Search className="h-5 w-5" /></button>
          <div className="relative hidden sm:block">
            <button className="icon-btn" aria-label="Language" aria-expanded={lang} onClick={() => setLang((l) => !l)}><Globe className="h-5 w-5" /></button>
            {lang && (
              <div className="glass absolute right-0 top-12 w-36 rounded-2xl p-1.5 shadow-xl">
                {LANGS.map((l) => <button key={l.code} onClick={() => setLang(false)} className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-sm hover:bg-line"><span>{l.label}</span><span className="text-xs text-brand">{l.code}</span></button>)}
              </div>
            )}
          </div>
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            {mounted && resolvedTheme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <button className="icon-btn relative" aria-label={`Wishlist (${wishlist.length})`} onClick={() => openDrawer("wishlist")}><Heart className="h-5 w-5" /><Badge n={wishlist.length} /></button>
          <button className="icon-btn relative" aria-label={`Cart (${cartCount})`} onClick={() => openDrawer("cart")}><ShoppingBag className="h-5 w-5" /><Badge n={cartCount} /></button>
          <button className="icon-btn md:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <AnimatePresence>
        {(search || menu) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line">
            <div className="space-y-2 px-4 py-3">
              {search && <div className="lg:hidden">{searchBox}</div>}
              {menu && LINKS.map((l) => <Link key={l.label} href={l.href} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium hover:bg-line">{l.label}</Link>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
