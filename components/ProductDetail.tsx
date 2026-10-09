"use client";
import Link from "next/link";
import { useState } from "react";
import { Heart, ShoppingBag, Star, Truck, ShieldCheck } from "lucide-react";
import type { Product } from "@/lib/types";
import { ImageViewer } from "./ImageViewer";
import { ProductCard } from "./ProductCard";
import { useStore } from "./StoreProvider";
import { useTryOn } from "./tryon/TryOnProvider";
import { TryOnIcon } from "./icons";
import { cn, isOnSale, money } from "@/lib/utils";

export function ProductDetail({ product: p, related }: { product: Product; related: Product[] }) {
  const { wishlist, toggleWishlist, addToCart } = useStore();
  const t = useTryOn();
  const [size, setSize] = useState(p.sizes[0] ?? "");
  const [color, setColor] = useState(p.colors[0] ?? "");
  const [shade, setShade] = useState(p.shades[0] ?? null);
  const liked = wishlist.includes(p.id);
  const sale = isOnSale(p);
  const off = sale ? Math.round((1 - (p.sale_price as number) / p.price) * 100) : 0;
  const isCosmetic = p.tryon_type === "face_makeup";

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/shop" className="hover:text-brand">Shop</Link> / <Link href={`/shop?category=${p.category_slug}`} className="hover:text-brand">{p.category_name}</Link>
        {p.subcategory_name && <> / <Link href={`/shop?category=${p.category_slug}&sub=${p.subcategory_slug}`} className="hover:text-brand">{p.subcategory_name}</Link></>}
      </nav>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ImageViewer images={p.images ?? []} name={p.name} />
        <div className="min-w-0">
          {p.brand_name && <Link href={`/shop?q=${encodeURIComponent(p.brand_name)}`} className="text-sm font-semibold uppercase tracking-wider text-brand">{p.brand_name}</Link>}
          <h1 className="mt-1 text-2xl font-extrabold leading-tight md:text-4xl">{p.name}</h1>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-1 font-semibold text-brand"><Star className="h-4 w-4 fill-current" />{p.rating.toFixed(1)}</span>
            <span className="text-muted">{p.rating_count} reviews</span>
            <span className={cn("ml-auto text-xs font-semibold", p.stock > 0 ? "text-emerald-400" : "text-red-400")}>{p.stock > 0 ? (p.stock < 10 ? `Only ${p.stock} left` : "In stock") : "Out of stock"}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-extrabold">{money(p.sale_price ?? p.price)}</span>
            {sale && <><span className="text-lg text-muted line-through">{money(p.price)}</span><span className="rounded-full bg-brand px-2.5 py-1 text-xs font-extrabold uppercase text-black">Sale −{off}%</span></>}
          </div>
          <p className="mt-5 leading-relaxed text-muted">{p.description}</p>

          {p.colors.length > 0 && (
            <fieldset className="mt-6"><legend className="label">Color: <b className="text-fg">{color}</b></legend>
              <div className="flex flex-wrap gap-2">{p.colors.map((c) => <button key={c} onClick={() => setColor(c)} aria-pressed={color === c} className={cn("chip", color === c && "chip-on")}>{c}</button>)}</div></fieldset>
          )}
          {p.sizes.length > 0 && (
            <fieldset className="mt-5"><legend className="label">Size: <b className="text-fg">{size}</b></legend>
              <div className="flex flex-wrap gap-2">{p.sizes.map((s) => <button key={s} onClick={() => setSize(s)} aria-pressed={size === s} className={cn("chip min-w-[48px] justify-center", size === s && "chip-on")}>{s}</button>)}</div></fieldset>
          )}
          {isCosmetic && p.shades.length > 0 && (
            <fieldset className="mt-5"><legend className="label">Shade: <b className="text-fg">{shade?.name}</b></legend>
              <div className="flex flex-wrap gap-3">{p.shades.map((s) => (
                <button key={s.hex} onClick={() => { setShade(s); if (t.hasPick(p.id)) t.setShade(p.id, s.hex, s.name); }} aria-label={s.name} aria-pressed={shade?.hex === s.hex} title={s.name}
                  className={cn("grid h-11 w-11 place-items-center rounded-full border-2 transition", shade?.hex === s.hex ? "border-brand" : "border-line")}><span className="h-8 w-8 rounded-full" style={{ background: s.hex }} /></button>
              ))}</div></fieldset>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <button className="btn-primary flex-1 sm:flex-none sm:min-w-[200px]" disabled={p.stock <= 0} onClick={() => addToCart(p.id, { size, color })}><ShoppingBag className="h-5 w-5" />Add to cart</button>
            <button className="btn-ghost !border-brand/60 text-brand" onClick={() => t.tryProduct(p, shade ?? undefined)}><TryOnIcon type={p.tryon_type} region={p.tryon_region} />Try this on</button>
            <button className="icon-btn" aria-pressed={liked} aria-label={liked ? "Remove from wishlist" : "Add to wishlist"} onClick={() => toggleWishlist(p.id)}><Heart className={cn("h-5 w-5", liked && "fill-brand text-brand")} /></button>
          </div>
          <ul className="mt-6 grid gap-2 text-sm text-muted sm:grid-cols-2">
            <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-brand" />Free shipping over $100</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" />30-day easy returns</li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="rel">
          <h2 id="rel" className="mb-4 text-xl font-bold">More from {p.category_name}</h2>
          <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
            {related.map((r, i) => <div key={r.id} className="w-[200px] shrink-0 snap-start sm:w-[230px]"><ProductCard p={r} index={i} /></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
