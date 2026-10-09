"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import type { CartItem } from "@/lib/types";

interface Store {
  wishlist: number[];
  toggleWishlist: (id: number) => Promise<void>;
  cart: CartItem[];
  addToCart: (id: number, o?: { size?: string; color?: string; qty?: number }) => Promise<void>;
  setQty: (id: number, qty: number) => Promise<void>;
  removeCart: (id: number) => Promise<void>;
  drawer: "cart" | "wishlist" | null;
  openDrawer: (d: "cart" | "wishlist" | null) => void;
  toast: (msg: string) => void;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error("StoreProvider missing"); return c; };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawer, openDrawer] = useState<Store["drawer"]>(null);
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);

  const toast = useCallback((text: string) => { const id = Date.now(); setMsg({ id, text }); setTimeout(() => setMsg((m) => (m?.id === id ? null : m)), 2600); }, []);

  useEffect(() => {
    api<{ ids: number[] }>("/api/wishlist").then((r) => setWishlist(r.ids)).catch(() => {});
    api<{ items: CartItem[] }>("/api/cart").then((r) => setCart(r.items)).catch(() => {});
  }, []);

  const value = useMemo<Store>(() => ({
    wishlist, cart, drawer, openDrawer, toast,
    toggleWishlist: async (id) => {
      const on = wishlist.includes(id);
      setWishlist((w) => (on ? w.filter((x) => x !== id) : [id, ...w]));
      try {
        const r = on ? await api<{ ids: number[] }>(`/api/wishlist?productId=${id}`, { method: "DELETE" }) : await api<{ ids: number[] }>("/api/wishlist", { method: "POST", body: JSON.stringify({ productId: id }) });
        setWishlist(r.ids);
        toast(on ? "Removed from wishlist" : "Saved to wishlist");
      } catch (e) { setWishlist((w) => (on ? [id, ...w] : w.filter((x) => x !== id))); toast((e as Error).message); }
    },
    addToCart: async (id, o) => {
      try {
        const r = await api<{ items: CartItem[] }>("/api/cart", { method: "POST", body: JSON.stringify({ productId: id, qty: o?.qty ?? 1, size: o?.size ?? "", color: o?.color ?? "" }) });
        setCart(r.items); toast("Added to cart");
      } catch (e) { toast((e as Error).message); }
    },
    setQty: async (id, qty) => { const r = await api<{ items: CartItem[] }>("/api/cart", { method: "PATCH", body: JSON.stringify({ id, qty }) }); setCart(r.items); },
    removeCart: async (id) => { const r = await api<{ items: CartItem[] }>(`/api/cart?id=${id}`, { method: "DELETE" }); setCart(r.items); },
  }), [wishlist, cart, drawer, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4 md:bottom-6">
        <AnimatePresence>
          {msg && (
            <motion.div key={msg.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
              className="glass rounded-full px-5 py-2.5 text-sm font-medium shadow-xl">{msg.text}</motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
