"use client";
import { useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, Trash2, Undo2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Staged {
  id?: number;            // existing product_images row
  token?: string;         // freshly uploaded + enhanced
  original: string;
  enhanced: string;
  useOriginal?: boolean;
  report?: { blurry: boolean; lowRes: boolean; upscaled: boolean; sharpened: boolean; backgroundRemoved: boolean; bgProvider: string; blurScore: number; width: number; height: number; sourceWidth: number; sourceHeight: number };
}

const OK = ["image/jpeg", "image/png", "image/webp"];

function uploadWithProgress(file: File, view: string, onProgress: (p: number) => void): Promise<{ token: string; original_path: string; enhanced_path: string; report: Staged["report"] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); xhr.status < 300 ? resolve(j) : reject(new Error(j.error || "Upload failed")); } catch { reject(new Error("Upload failed")); } };
    xhr.onerror = () => reject(new Error("Network error"));
    const fd = new FormData(); fd.append("file", file); fd.append("view", view);
    xhr.send(fd);
  });
}

export function ImageSlot({ label, hint, required, view, value, onChange, compact }: {
  label: string; hint?: string; required?: boolean; view: string; value: Staged | null; onChange: (v: Staged | null) => void; compact?: boolean;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);

  const handle = async (file?: File | null) => {
    if (!file) return;
    setErr("");
    if (!OK.includes(file.type)) return setErr("Only JPG, PNG or WebP");
    if (file.size > 10 * 1024 * 1024) return setErr("Max 10 MB");
    const preview = URL.createObjectURL(file); // instant preview while the server enhances it
    onChange({ original: preview, enhanced: preview });
    setProgress(0);
    try {
      const r = await uploadWithProgress(file, view, (p) => { setProgress(p); if (p >= 100) setProcessing(true); });
      onChange({ token: r.token, original: r.original_path, enhanced: r.enhanced_path, report: r.report });
      URL.revokeObjectURL(preview);
    } catch (e) { setErr((e as Error).message); onChange(null); }
    finally { setProgress(null); setProcessing(false); }
  };

  const busy = progress !== null;
  const showEnhanced = value && !value.useOriginal;
  const r = value?.report;
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">{label}{required && <span className="text-brand"> *</span>}</span>{hint && <span className="text-[11px] text-muted">{hint}</span>}</div>
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      {!value ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
          className={cn("grid place-items-center gap-2 rounded-xl border-2 border-dashed border-line p-4 text-center transition", compact ? "min-h-[130px]" : "min-h-[190px]", drag && "border-brand bg-brand/10")}>
          <ImagePlus className="h-7 w-7 text-muted" />
          <p className="hidden text-xs text-muted sm:block">Drag & drop an image</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !min-h-[44px] !px-4 text-xs" onClick={() => gallery.current?.click()}><ImagePlus className="h-4 w-4" />Gallery</button>
            <button type="button" className="btn-ghost !min-h-[44px] !px-4 text-xs md:hidden" onClick={() => camera.current?.click()}><Camera className="h-4 w-4" />Camera</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <figure><div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-bg">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={value.original} alt={`${label} original`} className="h-full w-full object-contain" /></div><figcaption className="mt-1 text-center text-[11px] text-muted">Original</figcaption></figure>
            <figure><div className="checker relative aspect-[4/5] overflow-hidden rounded-xl border border-line">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={showEnhanced ? value.enhanced : value.original} alt={`${label} enhanced`} className="h-full w-full object-contain" /></div><figcaption className="mt-1 text-center text-[11px] text-brand">{showEnhanced ? "Enhanced (cutout)" : "Using original"}</figcaption></figure>
          </div>
          {busy && (
            <div role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-line"><div className={cn("h-full rounded-full bg-brand transition-all", processing && "animate-pulse")} style={{ width: `${processing ? 100 : progress}%` }} /></div>
              <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{processing ? "Enhancing: auto-rotate, sharpen, cut out background…" : `Uploading ${progress}%`}</p>
            </div>
          )}
          {!busy && r && (
            <div className="flex flex-wrap gap-1 text-[10px]">
              {[[r.lowRes, `Low-res ${r.sourceWidth}×${r.sourceHeight} → upscaled`], [r.blurry, "Blurry → sharpened"], [r.backgroundRemoved, `Background removed (${r.bgProvider})`], [!r.blurry && !r.lowRes, "Good quality"]].filter(([on]) => on).map(([, t]) => <span key={t as string} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400"><Wand2 className="h-3 w-3" />{t as string}</span>)}
            </div>
          )}
          {!busy && (
            <div className="flex gap-2">
              {value.token && (
                <button type="button" onClick={() => onChange({ ...value, useOriginal: !value.useOriginal })} className={cn("btn-ghost flex-1 !min-h-[44px] text-xs", !value.useOriginal && "!border-emerald-500/50 text-emerald-400")}>
                  {value.useOriginal ? <><Undo2 className="h-4 w-4" />Use enhanced</> : <><CheckCircle2 className="h-4 w-4" />Approved</>}
                </button>
              )}
              <button type="button" className="btn-ghost !min-h-[44px] flex-1 text-xs" onClick={() => gallery.current?.click()}><ImagePlus className="h-4 w-4" />Replace</button>
              <button type="button" className="icon-btn hover:!text-red-400" aria-label={`Remove ${label}`} onClick={() => onChange(null)}><Trash2 className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  );
}
