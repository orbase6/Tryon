"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { analyzePhoto, fileToCanvas } from "@/lib/mediapipe";

export type TryOnProduct = Pick<Product, "id" | "name" | "slug" | "tryon_type" | "tryon_region" | "shades" | "category_slug" | "cover_thumb" | "cover">;
export interface PickItem { product: TryOnProduct; shade?: string; shadeName?: string }
type Status = "idle" | "analyzing" | "uploading" | "rendering" | "error";

interface Ctx {
  photoUrl: string | null;
  resultUrl: string | null;
  resultId: number | null;
  picks: PickItem[];
  status: Status;
  statusText: string;
  error: string | null;
  demo: boolean;
  notes: string[];
  saved: boolean;
  collapsed: boolean; setCollapsed: (v: boolean) => void;
  sheet: "closed" | "peek" | "half" | "full"; setSheet: (s: "closed" | "peek" | "half" | "full") => void;
  live: boolean; setLive: (v: boolean) => void;
  uploadPhoto: (f: Blob) => Promise<void>;
  tryProduct: (p: TryOnProduct, shade?: { hex: string; name: string }) => void;
  removePick: (id: number) => void;
  setShade: (id: number, hex: string, name: string) => void;
  startOver: () => void;
  save: (share: boolean) => Promise<boolean>;
  download: () => void;
  adoptCapture: (frame: Blob, picks: PickItem[]) => Promise<void>;
  hasPick: (id: number) => boolean;
}
const C = createContext<Ctx | null>(null);
export const useTryOn = () => { const c = useContext(C); if (!c) throw new Error("TryOnProvider missing"); return c; };

const SS = "tryon.session";

export function TryOnProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultId, setResultId] = useState<number | null>(null);
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState<Ctx["sheet"]>("closed");
  const [live, setLive] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const seq = useRef(0);

  useEffect(() => { if (window.innerWidth < 1024) setCollapsed(true); }, []); // tablets start with the panel collapsed

  useEffect(() => { // restore the photo session after reloads
    try { const s = JSON.parse(sessionStorage.getItem(SS) || "null"); if (s?.sessionId) { setSessionId(s.sessionId); setPhotoUrl(s.photoUrl); } } catch { /* ignore */ }
  }, []);

  const doUpload = useCallback(async (blob: Blob) => {
    setError(null); setSaved(false); setResultUrl(null); setResultId(null); setNotes([]);
    setStatus("analyzing"); setStatusText("Detecting face, pose and body parts…");
    let analysis = null as Awaited<ReturnType<typeof analyzePhoto>> | null;
    try { analysis = await analyzePhoto(await fileToCanvas(blob)); } catch (e) { console.warn("analysis unavailable", e); }
    setStatus("uploading"); setStatusText("Uploading photo…");
    const fd = new FormData();
    fd.append("photo", blob, "photo.jpg");
    if (analysis) { fd.append("analysis", JSON.stringify(analysis.analysis)); if (analysis.parsing) fd.append("parsing", analysis.parsing, "parsing.png"); }
    const res = await fetch("/api/tryon/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    setSessionId(data.sessionId); setPhotoUrl(data.photoUrl);
    try { sessionStorage.setItem(SS, JSON.stringify({ sessionId: data.sessionId, photoUrl: data.photoUrl })); } catch { /* ignore */ }
    if (!data.hasFace && !data.hasPose) setNotes(["We couldn't detect a person automatically. Use a clear, well-lit photo (or check your connection — detection models load in your browser)."]);
    setStatus("idle");
    return data.sessionId as string;
  }, []);

  const uploadPhoto = useCallback(async (f: Blob) => {
    try { await doUpload(f); setSheet((s) => (s === "closed" ? "half" : s)); }
    catch (e) { setStatus("error"); setError((e as Error).message); }
  }, [doUpload]);

  // Re-render whenever the picks or photo change. Removing a pick re-renders without it; no picks -> original photo.
  useEffect(() => {
    if (!sessionId) return;
    abort.current?.abort();
    if (!picks.length) { setResultUrl(null); setResultId(null); setSaved(false); setDemo(false); if (status === "rendering") setStatus("idle"); return; }
    const my = ++seq.current;
    const ctl = new AbortController();
    abort.current = ctl;
    const t = setTimeout(async () => {
      setStatus("rendering"); setStatusText("Fitting your picks — keeping everything else untouched…"); setError(null);
      try {
        const res = await fetch("/api/tryon/render", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
          body: JSON.stringify({ sessionId, picks: picks.map((p) => ({ productId: p.product.id, shade: p.shade })) }) });
        const data = await res.json().catch(() => ({}));
        if (my !== seq.current) return;
        if (!res.ok) { setStatus("error"); setError(data.error || "Try-on failed"); if (res.status === 404) { setSessionId(null); setPhotoUrl(null); try { sessionStorage.removeItem(SS); } catch { /* */ } } return; }
        setResultUrl(data.url); setResultId(data.resultId); setDemo(!!data.demo); setNotes(data.notes ?? []); setSaved(false); setStatus("idle");
      } catch (e) { if ((e as Error).name !== "AbortError" && my === seq.current) { setStatus("error"); setError((e as Error).message); } }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, sessionId]);

  const tryProduct = useCallback((p: TryOnProduct, shade?: { hex: string; name: string }) => {
    setPicks((cur) => {
      const s = shade ?? (p.shades[0] ? { hex: p.shades[0].hex, name: p.shades[0].name } : undefined);
      const item: PickItem = { product: p, shade: s?.hex, shadeName: s?.name };
      let next = cur.filter((x) => x.product.id !== p.id);
      if (p.tryon_type === "garment") next = next.filter((x) => x.product.tryon_type !== "garment"); // one garment at a time
      else next = next.filter((x) => !(x.product.tryon_type === p.tryon_type && x.product.tryon_region === p.tryon_region)); // same slot replaces
      return [...next, item];
    });
    setSheet((s) => (s === "closed" || s === "peek" ? "half" : s));
    setCollapsed(false);
  }, []);

  const removePick = useCallback((id: number) => setPicks((c) => c.filter((x) => x.product.id !== id)), []);
  const setShade = useCallback((id: number, hex: string, name: string) => setPicks((c) => c.map((x) => (x.product.id === id ? { ...x, shade: hex, shadeName: name } : x))), []);
  const startOver = useCallback(() => { setPicks([]); setError(null); setNotes([]); setStatus("idle"); }, []);

  const save = useCallback(async (share: boolean) => {
    if (!resultId) return false;
    const res = await fetch("/api/tryon/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultId, share }) });
    if (res.ok) setSaved(true);
    return res.ok;
  }, [resultId]);

  const download = useCallback(() => {
    const url = resultUrl ?? photoUrl; if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = "tryon.png"; document.body.appendChild(a); a.click(); a.remove();
  }, [resultUrl, photoUrl]);

  /** Live-mode capture: the frame becomes the photo and the picks are rendered by the AI pipeline. */
  const adoptCapture = useCallback(async (frame: Blob, capturePicks: PickItem[]) => {
    setSheet("half"); setCollapsed(false);
    try {
      await doUpload(frame);
      setPicks(capturePicks);
    } catch (e) { setStatus("error"); setError((e as Error).message); }
  }, [doUpload]);

  const value = useMemo<Ctx>(() => ({
    photoUrl, resultUrl, resultId, picks, status, statusText, error, demo, notes, saved, collapsed, setCollapsed, sheet, setSheet, live, setLive,
    uploadPhoto, tryProduct, removePick, setShade, startOver, save, download, adoptCapture, hasPick: (id) => picks.some((p) => p.product.id === id),
  }), [photoUrl, resultUrl, resultId, picks, status, statusText, error, demo, notes, saved, collapsed, sheet, live, uploadPhoto, tryProduct, removePick, setShade, startOver, save, download, adoptCapture]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
