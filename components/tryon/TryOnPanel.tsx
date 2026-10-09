"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronLeft, ChevronRight, Download, ImagePlus, Loader2, RotateCcw, ShieldCheck, Upload, X, Bookmark, Check } from "lucide-react";
import { useTryOn } from "./TryOnProvider";
import { BottomSheet } from "./BottomSheet";
import { TryOnIcon, Hanger } from "../icons";
import { cn } from "@/lib/utils";
import { useStore } from "../StoreProvider";

function Content() {
  const t = useTryOn();
  const { toast } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [share, setShare] = useState(false);
  const busy = t.status === "analyzing" || t.status === "uploading" || t.status === "rendering";
  const shown = t.resultUrl ?? t.photoUrl;
  useEffect(() => { if (shown) stage.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [shown]);

  const pickFile = (f?: File | null) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast("Use a JPG, PNG or WebP photo");
    if (f.size > 10 * 1024 * 1024) return toast("Photo must be 10 MB or smaller");
    t.uploadPhoto(f);
  };

  return (
    <div className="space-y-4">
      <div
        ref={stage} style={{ width: "min(100%, calc(50vh * 0.75))", aspectRatio: "3 / 4" }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
        className={cn("relative mx-auto overflow-hidden rounded-2xl border border-dashed border-line bg-bg/60 transition", drag && "border-brand bg-brand/10")}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={t.resultUrl ? "Your try-on result" : "Your photo"} className="h-full w-full object-contain" />
        ) : (
          <button onClick={() => input.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-brand"><ImagePlus className="h-7 w-7" /></span>
            <span className="text-sm font-semibold">Upload a selfie or full-body photo</span>
            <span className="text-xs text-muted">Then tap the <Hanger className="inline h-3.5 w-3.5 -mt-0.5" /> on any product to wear it.</span>
          </button>
        )}
        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm" role="status">
              <div className="flex flex-col items-center gap-3 px-6 text-center text-white"><Loader2 className="h-8 w-8 animate-spin text-brand" /><span className="text-sm">{t.statusText}</span></div>
            </motion.div>
          )}
        </AnimatePresence>
        {!t.demo && t.resultUrl && t.provider && t.provider !== "none" && <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-black">AI · {t.provider}</span>}
        {t.demo && t.resultUrl && <span className="absolute left-2 top-2 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-black">DEMO — add an AI key</span>}
      </div>

      {t.error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{t.error}</p>}
      {t.notes.filter((n) => n !== "garment-cache").map((n) => <p key={n} className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-muted">{n}</p>)}

      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary" onClick={() => input.current?.click()}><Upload className="h-4 w-4" />{t.photoUrl ? "Change photo" : "Upload photo"}</button>
        <button className="btn-ghost" onClick={() => t.setLive(true)}><Camera className="h-4 w-4" />Live / camera</button>
        <button className="btn-ghost" onClick={t.startOver} disabled={!t.picks.length && !t.error}><RotateCcw className="h-4 w-4" />Start over</button>
        <button className="btn-ghost" onClick={t.download} disabled={!shown}><Download className="h-4 w-4" />Download</button>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-ghost flex-1" disabled={!t.resultId || t.saved || busy}
          onClick={async () => { (await t.save(share)) ? toast("Saved to your gallery") : toast("Could not save"); }}>
          {t.saved ? <><Check className="h-4 w-4" />Saved</> : <><Bookmark className="h-4 w-4" />Save to gallery</>}
        </button>
        <label className="flex min-h-[44px] items-center gap-2 text-xs text-muted"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4 accent-brand" />Share publicly</label>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Your picks</h3>
        {t.picks.length === 0 ? (
          <p className="rounded-xl bg-card px-3 py-3 text-xs text-muted">Nothing selected yet. Pick a product to see it on you — add more to stack them (coat + glasses + watch…).</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {t.picks.map((p) => (
              <li key={p.product.id} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-1">
                <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-bg">
                  {p.product.cover_thumb ? <Image src={p.product.cover_thumb} alt="" fill sizes="32px" className="object-contain p-0.5" unoptimized /> : <TryOnIcon type={p.product.tryon_type} region={p.product.tryon_region} className="h-4 w-4" />}
                </span>
                <span className="max-w-[110px] truncate text-xs font-medium">{p.product.name}</span>
                {p.product.tryon_type === "face_makeup" && p.product.shades.length > 0 && (
                  <span className="flex gap-1">
                    {p.product.shades.map((s) => (
                      <button key={s.hex} aria-label={`Shade ${s.name}`} title={s.name} onClick={() => t.setShade(p.product.id, s.hex, s.name)}
                        className={cn("h-5 w-5 rounded-full border-2", p.shade === s.hex ? "border-brand" : "border-transparent")} style={{ background: s.hex }} />
                    ))}
                  </span>
                )}
                <button aria-label={`Remove ${p.product.name}`} onClick={() => t.removePick(p.product.id)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-line"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="flex gap-2 text-[11px] leading-relaxed text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-brand" />Privacy: your photo is processed only to create your try-on and is deleted automatically after 24 hours unless you save the result to the gallery. Only the selected product area is edited — your face, hair, pose and background stay untouched.</p>
    </div>
  );
}

export function TryOnPanel() {
  const t = useTryOn();
  return (
    <>
      {/* Desktop / tablet: sticky collapsible left panel */}
      <motion.aside
        className="relative hidden shrink-0 md:block"
        animate={{ width: t.collapsed ? 56 : 340 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
        aria-label="Virtual try-on panel">
        <div className="sticky top-[68px] h-[calc(100vh-68px)] overflow-hidden border-r border-line bg-surface/60">
          <button onClick={() => t.setCollapsed(!t.collapsed)} aria-label={t.collapsed ? "Expand try-on panel" : "Collapse try-on panel"}
            className="absolute right-2 top-2 z-10 icon-btn !h-9 !w-9 !min-h-0 !min-w-0">
            {t.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          {t.collapsed ? (
            <button onClick={() => t.setCollapsed(false)} className="mt-14 flex w-full flex-col items-center gap-3 text-muted hover:text-brand" aria-label="Open try-on">
              <Hanger className="h-6 w-6" />
              {t.picks.length > 0 && <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs font-bold text-black">{t.picks.length}</span>}
              <span className="[writing-mode:vertical-rl] text-xs font-semibold tracking-wider">VIRTUAL TRY-ON</span>
            </button>
          ) : (
            <div className="h-full overflow-y-auto px-4 pb-8 pt-3">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold"><Hanger className="h-5 w-5 text-brand" />Virtual Try-On</h2>
              <Content />
            </div>
          )}
        </div>
      </motion.aside>

      {/* Mobile: floating button + bottom sheet */}
      <AnimatePresence>
        {t.sheet === "closed" && !t.live && (
          <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => t.setSheet("half")}
            className="fixed bottom-5 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full bg-brand text-black shadow-[0_10px_30px_rgba(255,122,26,.5)] md:hidden" aria-label="Open virtual try-on">
            <Hanger className="h-6 w-6" />
            {t.picks.length > 0 && <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-fg text-xs font-bold text-bg">{t.picks.length}</span>}
          </motion.button>
        )}
      </AnimatePresence>
      <BottomSheet><Content /></BottomSheet>
    </>
  );
}
