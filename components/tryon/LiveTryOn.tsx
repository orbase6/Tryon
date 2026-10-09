"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, RefreshCcw, X } from "lucide-react";
import { useTryOn, PickItem } from "./TryOnProvider";
import { LiveEngine, LiveProduct } from "@/lib/live/engine";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Full-screen live try-on: only the video, a product strip, flip, capture and close. */
export function LiveTryOn() {
  const t = useTryOn();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<LiveEngine | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [active, setActive] = useState<Map<number, string | undefined>>(() => new Map(t.picks.map((p) => [p.product.id, p.shade])));
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => { // lock page scroll + load catalogue for the switcher strip
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    api<{ items: Product[] }>("/api/products?pageSize=60&sort=rating").then((r) => setCatalog(r.items)).catch(() => {});
    return () => { document.body.style.overflow = prev; };
  }, []);

  const ordered = useMemo(() => {
    const ids = new Set(t.picks.map((p) => p.product.id));
    const fromPicks = t.picks.map((p) => catalog.find((c) => c.id === p.product.id) ?? (p.product as unknown as Product));
    return [...fromPicks, ...catalog.filter((c) => !ids.has(c.id))];
  }, [catalog, t.picks]);

  const startCamera = useCallback(async (face: "user" | "environment") => {
    setError(null); setReady(false);
    stream.current?.getTracks().forEach((s) => s.stop());
    if (!navigator.mediaDevices?.getUserMedia) { setError(!window.isSecureContext ? "Camera access needs a secure (HTTPS) connection. Open this site over HTTPS (or localhost)." : "This browser does not support camera access."); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: face }, ...(window.innerHeight > window.innerWidth ? { width: { ideal: 720 }, height: { ideal: 1280 } } : { width: { ideal: 1280 }, height: { ideal: 720 } }) }, audio: false });
      stream.current = s;
      const v = video.current!; v.srcObject = s; await v.play();
      if (engine.current) engine.current.mirrored = face === "user";
      setReady(true);
    } catch (e) {
      const n = (e as DOMException).name;
      setError(n === "NotAllowedError" ? "Camera permission was blocked. Allow camera access in your browser settings and try again." : n === "NotFoundError" ? "No camera was found on this device." : "Couldn't start the camera. Close other apps using it and try again.");
    }
  }, []);

  useEffect(() => { // engine lifecycle
    const e = new LiveEngine(video.current!, canvas.current!, setLost);
    engine.current = e; e.start();
    return () => { e.stop(); engine.current = null; stream.current?.getTracks().forEach((s) => s.stop()); };
  }, []);
  useEffect(() => { startCamera(facing); }, [facing, startCamera]);

  useEffect(() => { // push active products to the engine
    const list: LiveProduct[] = [];
    for (const [id, shade] of active) {
      const p = ordered.find((x) => x.id === id); if (!p) continue;
      const img = (p as Product).images?.find((i) => i.view === "front")?.enhanced_path ?? p.cover;
      if (img) list.push({ id, type: p.tryon_type, region: p.tryon_region, shade, src: img });
    }
    engine.current?.setProducts(list).catch((e) => console.warn("live products", e));
  }, [active, ordered]);

  const toggle = (p: Product) => setActive((cur) => {
    const n = new Map(cur);
    if (n.has(p.id)) { n.delete(p.id); return n; }
    for (const [id] of n) { const o = ordered.find((x) => x.id === id); if (o && (p.tryon_type === "garment" ? o.tryon_type === "garment" : o.tryon_type === p.tryon_type && o.tryon_region === p.tryon_region)) n.delete(id); }
    n.set(p.id, p.shades[0]?.hex);
    return n;
  });

  const capture = async () => {
    if (!engine.current || capturing) return;
    setCapturing(true);
    const frame = await engine.current.captureFrame();
    if (!frame) { setCapturing(false); return; }
    const picks: PickItem[] = [...active].map(([id, shade]) => { const p = ordered.find((x) => x.id === id)!; return { product: p, shade, shadeName: p.shades.find((s) => s.hex === shade)?.name }; });
    t.setLive(false);
    await t.adoptCapture(frame, picks);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black" role="dialog" aria-modal aria-label="Live try-on">
      <video ref={video} playsInline muted className="pointer-events-none absolute h-px w-px opacity-0" />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="Live camera with products applied" />

      {!ready && !error && <div className="absolute inset-0 grid place-items-center text-white"><Loader2 className="h-9 w-9 animate-spin text-brand" /></div>}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-white">
          <div className="max-w-sm space-y-4"><Camera className="mx-auto h-10 w-10 text-brand" /><p role="alert">{error}</p>
            <div className="flex justify-center gap-2"><button className="btn-primary" onClick={() => startCamera(facing)}>Try again</button><button className="btn-ghost !bg-white/10 !text-white" onClick={() => t.setLive(false)}>Upload a photo instead</button></div></div>
        </div>
      )}
      {lost && ready && <p className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur">Low light / stand back</p>}

      <button onClick={() => t.setLive(false)} aria-label="Close live try-on" className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-12 w-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><X className="h-6 w-6" /></button>
      <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Flip camera" className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-12 w-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><RefreshCcw className="h-5 w-5" /></button>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        <ul className="no-scrollbar flex w-full gap-2 overflow-x-auto px-4" aria-label="Choose products">
          {ordered.map((p) => (
            <li key={p.id} className="shrink-0">
              <button onClick={() => toggle(p)} aria-pressed={active.has(p.id)} aria-label={p.name} className={cn("relative h-14 w-14 overflow-hidden rounded-2xl border-2 bg-white/90", active.has(p.id) ? "border-brand" : "border-transparent opacity-80")}>
                {p.cover_thumb && <Image src={p.cover_thumb} alt="" fill sizes="56px" className="object-contain p-1" unoptimized />}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={capture} disabled={!ready || capturing} aria-label="Capture" className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white bg-white/20 backdrop-blur active:scale-95 disabled:opacity-50">
          {capturing ? <Loader2 className="h-7 w-7 animate-spin text-white" /> : <span className="h-14 w-14 rounded-full bg-white" />}
        </button>
      </div>
    </div>
  );
}
