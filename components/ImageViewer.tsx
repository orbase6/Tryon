"use client";
import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import type { ProductImage } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = { front: "Front", back: "Back", side: "Side", extra: "Detail" };

/** Shows the images exactly as uploaded in admin, in order: front, back, side, extras. */
export function ImageViewer({ images, name }: { images: ProductImage[]; name: string }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const n = images.length;
  const go = (k: number) => { setZoom(false); setI((k + n) % n); };
  const cur = images[i];
  const front = images.findIndex((x) => x.view === "front"), back = images.findIndex((x) => x.view === "back");

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!zoom) return;
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => { if (Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 500) go(i + (info.offset.x < 0 ? 1 : -1)); };

  if (!cur) return <div className="skeleton aspect-[4/5] w-full" />;
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {n > 1 && (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto md:max-h-[640px] md:flex-col md:overflow-y-auto" aria-label="Thumbnails">
          {images.map((im, k) => (
            <li key={im.id} className="shrink-0">
              <button onClick={() => go(k)} aria-label={`Show ${LABEL[im.view]} image`} aria-current={k === i}
                className={cn("relative block h-20 w-16 overflow-hidden rounded-xl border-2 bg-card transition md:h-24 md:w-20", k === i ? "border-brand" : "border-line hover:border-brand/50")}>
                <Image src={im.thumb_path} alt="" fill sizes="80px" className="object-contain p-1" unoptimized />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold text-white">{LABEL[im.view]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative min-w-0 flex-1">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl2 border border-line bg-gradient-to-b from-line/40 to-transparent"
          onPointerMove={move} onPointerLeave={() => setZoom(false)} onMouseEnter={(e) => { if (window.matchMedia("(hover:hover)").matches) { setZoom(true); move(e as unknown as React.PointerEvent<HTMLDivElement>); } }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={cur.id} className="absolute inset-0 cursor-zoom-in" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}
              drag={zoom ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25} onDragEnd={onDragEnd} onTap={() => setZoom((z) => !z)} style={{ touchAction: "pan-y" }}>
              <Image src={cur.enhanced_path} alt={`${name} — ${LABEL[cur.view]} view`} fill priority sizes="(max-width:768px) 100vw, 50vw" unoptimized draggable={false}
                className="select-none object-contain p-6 transition-transform duration-200" style={{ transform: zoom ? "scale(2)" : "scale(1)", transformOrigin: origin }} />
            </motion.div>
          </AnimatePresence>
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur"><ZoomIn className="h-3.5 w-3.5" />{zoom ? "Tap to reset" : "Tap to zoom"}</span>
          {n > 1 && <>
            <button onClick={() => go(i - 1)} aria-label="Previous image" className="icon-btn absolute left-2 top-1/2 hidden -translate-y-1/2 md:inline-flex"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => go(i + 1)} aria-label="Next image" className="icon-btn absolute right-2 top-1/2 hidden -translate-y-1/2 md:inline-flex"><ChevronRight className="h-5 w-5" /></button>
          </>}
        </div>
        {front >= 0 && back >= 0 && (
          <div className="mt-3 inline-flex rounded-full border border-line bg-card p-1" role="group" aria-label="Front or back view">
            {[["Front", front], ["Back", back]].map(([l, k]) => (
              <button key={l as string} onClick={() => go(k as number)} aria-pressed={i === k} className={cn("min-h-[40px] rounded-full px-5 text-sm font-semibold transition", i === k ? "bg-brand text-black" : "hover:text-brand")}>{l}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
