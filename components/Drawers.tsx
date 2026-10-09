"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { useStore } from "./StoreProvider";
import { api } from "@/lib/api";
import { money } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function Drawers() {
  const { drawer, openDrawer, cart, setQty, removeCart, wishlist, toggleWishlist, addToCart } = useStore();
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    if (drawer !== "wishlist" || !wishlist.length) { setItems([]); return; }
    api<{ items: Product[] }>(`/api/products?ids=${wishlist.join(",")}&pageSize=50`).then((r) => setItems(r.items)).catch(() => {});
  }, [drawer, wishlist]);
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && openDrawer(null); window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [openDrawer]);

  const total = cart.reduce((s, i) => s + (i.sale_price ?? i.price) * i.qty, 0);
  return (
    <AnimatePresence>
      {drawer && (
        <>
          <motion.div key="bd" className="fixed inset-0 z-[80] bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => openDrawer(null)} />
          <motion.aside key="dr" role="dialog" aria-label={drawer === "cart" ? "Cart" : "Wishlist"} className="fixed right-0 top-0 z-[81] flex h-full w-full max-w-md flex-col border-l border-line bg-surface"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}>
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-lg font-bold">{drawer === "cart" ? "Your cart" : "Wishlist"}</h2>
              <button className="icon-btn" aria-label="Close" onClick={() => openDrawer(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {drawer === "cart" && (cart.length === 0 ? <p className="py-16 text-center text-sm text-muted">Your cart is empty.</p> : cart.map((i) => (
                <div key={i.id} className="flex gap-3 rounded-2xl border border-line bg-card p-2.5">
                  <Link href={`/product/${i.slug}`} onClick={() => openDrawer(null)} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-bg">{i.thumb && <Image src={i.thumb} alt="" fill sizes="80px" className="object-contain p-1" unoptimized />}</Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.name}</p>
                    <p className="text-xs text-muted">{[i.size, i.color].filter(Boolean).join(" · ") || "—"}</p>
                    <p className="mt-1 text-sm font-bold text-brand">{money((i.sale_price ?? i.price) * i.qty)}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <button className="icon-btn !h-9 !w-9 !min-h-0 !min-w-0" aria-label="Decrease" disabled={i.qty <= 1} onClick={() => setQty(i.id, i.qty - 1)}><Minus className="h-3.5 w-3.5" /></button>
                      <span className="w-7 text-center text-sm">{i.qty}</span>
                      <button className="icon-btn !h-9 !w-9 !min-h-0 !min-w-0" aria-label="Increase" onClick={() => setQty(i.id, i.qty + 1)}><Plus className="h-3.5 w-3.5" /></button>
                      <button className="icon-btn ml-auto !h-9 !w-9 !min-h-0 !min-w-0" aria-label="Remove" onClick={() => removeCart(i.id)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              )))}
              {drawer === "wishlist" && (items.length === 0 ? <p className="py-16 text-center text-sm text-muted">Tap the heart on a product to save it here.</p> : items.map((p) => (
                <div key={p.id} className="flex gap-3 rounded-2xl border border-line bg-card p-2.5">
                  <Link href={`/product/${p.slug}`} onClick={() => openDrawer(null)} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-bg">{p.cover_thumb && <Image src={p.cover_thumb} alt="" fill sizes="80px" className="object-contain p-1" unoptimized />}</Link>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="text-sm font-bold text-brand">{money(p.sale_price ?? p.price)}</p>
                    <div className="mt-1 flex gap-2"><button className="btn-ghost !min-h-[40px] !px-3 text-xs" onClick={() => addToCart(p.id, { size: p.sizes[0], color: p.colors[0] })}>Add to cart</button>
                      <button className="btn-ghost !min-h-[40px] !px-3 text-xs" onClick={() => toggleWishlist(p.id)}>Remove</button></div></div>
                </div>
              )))}
            </div>
            {drawer === "cart" && cart.length > 0 && (
              <div className="border-t border-line p-4"><div className="mb-3 flex justify-between text-sm"><span className="text-muted">Subtotal</span><b>{money(total)}</b></div>
                <button className="btn-primary w-full" onClick={() => alert("Checkout is outside the scope of this demo store.")}>Checkout</button></div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
