"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTryOn, TryOnProduct } from "./tryon/TryOnProvider";
import { useStore } from "./StoreProvider";
import { Hanger } from "./icons";

interface Look { image_id: number; path: string; thumb: string; view: string; product_id: number; name: string; slug: string; category_slug: string; brand_name: string | null }
interface Saved { id: number; result_path: string; created_at: string; mine: boolean; products: { id: number; name: string; slug: string; category_slug: string }[] }
interface Item { key: string; kind: "look" | "tryon"; src: string; thumb: string; title: string; sub: string; slug?: string; productId?: number; savedId?: number; mine?: boolean; ratio: number }

const CATS = [["", "All"], ["clothing", "Clothing"], ["cosmetics", "Cosmetics"], ["accessories", "Accessories"]];
const RATIOS = [1.25, 1.0, 1.4, 1.15, 1.32];

export function GalleryClient() {
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState<"all" | "look" | "tryon">("all");
  const [look, setLook] = useState<Look[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const t = useTryOn();
  const { toast } = useStore();

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api<{ lookbook: Look[]; tryons: Saved[] }>(`/api/gallery${cat ? `?category=${cat}` : ""}`)
      .then((r) => { setLook(r.lookbook); setSaved(r.tryons); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [cat]);
  useEffect(load, [load]);

  const items: Item[] = [
    ...(tab !== "look" ? saved.map((s, i): Item => ({ key: `t${s.id}`, kind: "tryon", src: s.result_path, thumb: s.result_path, title: s.products.map((p) => p.name).join(" + ") || "My try-on", sub: s.mine ? "My try-on" : "Community try-on", slug: s.products[0]?.slug, productId: s.products[0]?.id, savedId: s.id, mine: s.mine, ratio: 1.33 + (i % 2) * 0.1 })) : []),
    ...(tab !== "tryon" ? look.map((l, i): Item => ({ key: `l${l.image_id}`, kind: "look", src: l.path, thumb: l.thumb, title: l.name, sub: `${l.brand_name ?? ""} · ${l.view}`.replace(/^ · /, ""), slug: l.slug, productId: l.product_id, ratio: RATIOS[i % RATIOS.length] })) : []),
  ];
  const cur = open !== null ? items[open] : null;
  const go = useCallback((d: number) => setOpen((o) => (o === null ? o : (o + d + items.length) % items.length)), [items.length]);
  useEffect(() => {
    if (open === null) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [open, go]);

  const tryThis = async (it: Item) => {
    if (!it.slug) return;
    try { const p = await api<TryOnProduct>(`/api/products/${it.slug}`); t.tryProduct(p); setOpen(null); toast("Added to your try-on picks"); } catch (e) { toast((e as Error).message); }
  };
  const del = async (it: Item) => { await api(`/api/tryon/save?id=${it.savedId}`, { method: "DELETE" }); setOpen(null); load(); };

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Gallery</h1>
      <p className="mt-1 text-sm text-muted">Lookbook pieces and try-on results saved by you and the community.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">{CATS.map(([v, l]) => <button key={v} onClick={() => setCat(v)} className={cn("chip", cat === v && "chip-on")}>{l}</button>)}</div>
        <div className="ml-auto inline-flex rounded-full border border-line bg-card p-1" role="group" aria-label="Gallery source">
          {([["all", "All"], ["look", "Lookbook"], ["tryon", "Try-ons"]] as const).map(([v, l]) => <button key={v} aria-pressed={tab === v} onClick={() => setTab(v)} className={cn("min-h-[40px] rounded-full px-4 text-sm font-semibold", tab === v ? "bg-brand text-black" : "hover:text-brand")}>{l}</button>)}
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error} <button onClick={load} className="underline">Retry</button></p>}
      <div className="mt-5 columns-2 gap-3 md:columns-3 md:gap-4 2xl:columns-4">
        {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton mb-3 w-full md:mb-4" style={{ aspectRatio: `1 / ${RATIOS[i % 5]}` }} />)}
        {!loading && items.map((it, i) => (
          <motion.button key={it.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
            onClick={() => setOpen(i)} className="group relative mb-3 block w-full overflow-hidden rounded-xl2 border border-line bg-card text-left md:mb-4" style={{ breakInside: "avoid" }} aria-label={`Open ${it.title}`}>
            <div className="relative w-full bg-gradient-to-b from-line/40 to-transparent" style={{ aspectRatio: `1 / ${it.ratio}` }}>
              <Image src={it.thumb} alt={it.title} fill sizes="(max-width:768px) 50vw, 25vw" className={cn("transition duration-500 group-hover:scale-105", it.kind === "tryon" ? "object-cover" : "object-contain p-5")} unoptimized />
            </div>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 text-white"><span className="block truncate text-sm font-semibold">{it.title}</span><span className="block truncate text-xs text-white/70">{it.sub}</span></span>
            {it.kind === "tryon" && <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-black">TRY-ON</span>}
          </motion.button>
        ))}
      </div>
      {!loading && !error && items.length === 0 && (
        <div className="grid place-items-center gap-3 py-24 text-center"><ImageOff className="h-10 w-10 text-muted" /><p className="font-semibold">Nothing here yet</p><p className="max-w-sm text-sm text-muted">Upload a photo in the try-on panel, wear something and tap “Save to gallery”.</p></div>
      )}

      <AnimatePresence>
        {cur && (
          <motion.div className="fixed inset-0 z-[95] flex flex-col bg-black/90 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal aria-label={cur.title}>
            <div className="flex items-center justify-between p-3 text-white"><div className="min-w-0"><p className="truncate font-semibold">{cur.title}</p><p className="truncate text-xs text-white/60">{cur.sub} · {open! + 1}/{items.length}</p></div>
              <button className="icon-btn !border-white/20 !bg-white/10 !text-white" aria-label="Close" onClick={() => setOpen(null)}><X className="h-5 w-5" /></button></div>
            <div className="relative min-h-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={cur.key} className="absolute inset-0 p-2 sm:p-6" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.3}
                  onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 70) go(i.offset.x < 0 ? 1 : -1); }}>
                  <div className={cn("relative h-full w-full", cur.kind === "look" && "rounded-2xl bg-card/90")}><Image src={cur.src} alt={cur.title} fill sizes="100vw" className="select-none object-contain p-2" unoptimized priority draggable={false} /></div>
                </motion.div>
              </AnimatePresence>
              <button className="icon-btn absolute left-2 top-1/2 -translate-y-1/2 !border-white/20 !bg-white/10 !text-white" aria-label="Previous" onClick={() => go(-1)}><ChevronLeft className="h-6 w-6" /></button>
              <button className="icon-btn absolute right-2 top-1/2 -translate-y-1/2 !border-white/20 !bg-white/10 !text-white" aria-label="Next" onClick={() => go(1)}><ChevronRight className="h-6 w-6" /></button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 p-3 pb-5">
              <a className="btn-ghost !border-white/25 !bg-white/10 !text-white" href={cur.src} download={`${cur.slug ?? "tryon"}.${cur.src.endsWith(".svg") ? "svg" : "png"}`}><Download className="h-4 w-4" />Download</a>
              {cur.slug && <button className="btn-primary" onClick={() => tryThis(cur)}><Hanger className="h-4 w-4" />Try this product</button>}
              {cur.slug && <Link href={`/product/${cur.slug}`} className="btn-ghost !border-white/25 !bg-white/10 !text-white"><ExternalLink className="h-4 w-4" />View product</Link>}
              {cur.kind === "tryon" && cur.mine && <button className="btn-ghost !border-red-400/40 !text-red-300" onClick={() => del(cur)}><Trash2 className="h-4 w-4" />Delete</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
