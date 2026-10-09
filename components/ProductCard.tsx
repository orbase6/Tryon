"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Star } from "lucide-react";
import type { Product } from "@/lib/types";
import { cn, isOnSale, money } from "@/lib/utils";
import { useStore } from "./StoreProvider";
import { useTryOn } from "./tryon/TryOnProvider";
import { TryOnIcon } from "./icons";

export function ProductCard({ p, index = 0 }: { p: Product; index?: number }) {
  const { wishlist, toggleWishlist, addToCart } = useStore();
  const t = useTryOn();
  const liked = wishlist.includes(p.id);
  const sale = isOnSale(p);
  const active = t.hasPick(p.id);
  const label = p.tryon_type === "garment" ? "Try on" : p.tryon_type === "face_makeup" ? "Try this shade" : "Try on";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.35, delay: Math.min(index % 8, 7) * 0.04 }}
      whileHover={{ scale: 1.02 }}
      className="group relative flex flex-col overflow-hidden rounded-xl2 border border-line bg-card shadow-sm transition-colors hover:border-brand/50">
      {/* orange corner blob revealed on hover */}
      <span aria-hidden className="pointer-events-none absolute -right-14 -top-14 z-0 h-32 w-32 scale-50 rounded-full bg-brand opacity-0 blur-[2px] transition duration-500 group-hover:scale-100 group-hover:opacity-90" />
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-b from-line/40 to-transparent">
        <Link href={`/product/${p.slug}`} className="absolute inset-0 z-[1]" aria-label={p.name}>
          {p.cover && <Image src={p.cover} alt={p.name} fill sizes="(max-width:768px) 50vw, (max-width:1280px) 33vw, 25vw" className="object-contain p-4 transition duration-500 group-hover:scale-105" unoptimized />}
        </Link>
        {sale && <span className="absolute left-3 top-3 z-[2] rounded-full bg-brand px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-black">Sale</span>}
        <span className="absolute bottom-3 left-3 z-[2] inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur"><Star className="h-3 w-3 fill-brand text-brand" />{p.rating.toFixed(1)}</span>
        <button onClick={() => toggleWishlist(p.id)} aria-pressed={liked} aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute right-2.5 top-2.5 z-[3] grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 group-hover:bg-black/30">
          <Heart className={cn("h-5 w-5 transition", liked && "fill-brand text-brand")} />
        </button>
      </div>
      <div className="relative z-[1] flex flex-1 flex-col gap-1 p-3.5">
        <p className="truncate text-xs text-muted">{p.brand_name ?? p.category_name}</p>
        <Link href={`/product/${p.slug}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight hover:text-brand">{p.name}</Link>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-bold">{money(p.sale_price ?? p.price)}</span>
          {sale && <span className="text-xs text-muted line-through">{money(p.price)}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => t.tryProduct(p)} aria-pressed={active} title={label}
            className={cn("btn flex-1 !px-3 text-xs", active ? "bg-brand text-black" : "border border-brand/50 bg-brand/10 text-brand hover:bg-brand hover:text-black")}>
            <TryOnIcon type={p.tryon_type} region={p.tryon_region} className="h-5 w-5" /><span className="truncate">{active ? "Wearing" : label}</span>
          </button>
          <button onClick={() => addToCart(p.id, { size: p.sizes[0], color: p.colors[0] })} aria-label={`Add ${p.name} to cart`} className="icon-btn shrink-0 hover:!bg-brand hover:!text-black"><ShoppingBag className="h-5 w-5" /></button>
        </div>
      </div>
    </motion.article>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl2 border border-line bg-card" aria-hidden>
      <div className="skeleton aspect-[4/5] w-full !rounded-none" />
      <div className="space-y-2 p-3.5"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-4 w-1/3" /><div className="skeleton h-11 w-full !rounded-full" /></div>
    </div>
  );
}
