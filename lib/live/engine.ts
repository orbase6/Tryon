"use client";
// Real-time try-on engine: MediaPipe landmark tracking (pose / face / hands) + 2D canvas overlays.
// A generative model cannot run at video rate, so live mode warps the product cutout onto landmarks;
// the Capture button hands the frame to the photoreal AI pipeline.
import { getFace, getHands, getPose } from "../mediapipe";
import { PointSmoother } from "./oneEuro";
import { BROW_L, BROW_R, CHEEKS, EYE_L_FULL, EYE_L_LO, EYE_L_UP, EYE_R_FULL, EYE_R_LO, EYE_R_UP, FACE_OVAL, LIPS_INNER, LIPS_OUTER } from "../faceIndices";

export interface LiveProduct {
  id: number;
  type: "garment" | "face_makeup" | "accessory";
  region: string;
  shade?: string;
  src: string;
}
type Pt = [number, number];
type LM = { x: number; y: number; visibility?: number };
interface Item extends LiveProduct { img: HTMLCanvasElement | null }

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Pt, b: Pt, t = 0.5): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Load an image and crop it to its non-transparent bounds so scaling maths is exact. */
async function loadTight(src: string): Promise<HTMLCanvasElement> {
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = src; await img.decode();
  const w = img.naturalWidth || 800, h = img.naturalHeight || 1000;
  const full = document.createElement("canvas"); full.width = w; full.height = h;
  const fc = full.getContext("2d", { willReadFrequently: true })!; fc.drawImage(img, 0, 0, w, h);
  const d = fc.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = w; y1 = h; }
  const maxSide = 900, s = Math.min(1, maxSide / Math.max(x1 - x0, y1 - y0));
  const out = document.createElement("canvas"); out.width = Math.max(1, Math.round((x1 - x0 + 1) * s)); out.height = Math.max(1, Math.round((y1 - y0 + 1) * s));
  out.getContext("2d")!.drawImage(full, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  return out;
}

export class LiveEngine {
  private items: Item[] = [];
  private raf = 0;
  private running = false;
  private sm = new PointSmoother();
  private frame = 0;
  private pose: LM[] | null = null; private face: LM[] | null = null; private hands: LM[][] = [];
  private lastSeen = { pose: 0, face: 0, hands: 0 };
  private lostState = false;
  private fpsT = performance.now(); private fpsN = 0; fps = 0;
  mirrored = true;

  constructor(private video: HTMLVideoElement, private canvas: HTMLCanvasElement, private onLost: (lost: boolean) => void) {}

  async setProducts(list: LiveProduct[]) {
    const prev = new Map(this.items.map((i) => [i.id, i.img]));
    this.items = await Promise.all(list.map(async (p) => ({ ...p, img: prev.get(p.id) ?? (await loadTight(p.src).catch(() => null)) })));
    const now = performance.now(); this.lastSeen = { pose: now, face: now, hands: now };
    await primeLandmarkers(this.needs());
    const n2 = performance.now(); this.lastSeen = { pose: n2, face: n2, hands: n2 };
  }

  private needs() {
    const t = this.items;
    return {
      pose: t.some((i) => i.type === "garment" || (i.type === "accessory" && ["wrist", "shoulder"].includes(i.region))),
      face: t.some((i) => i.type === "face_makeup" || (i.type === "accessory" && ["eyes", "ears", "head"].includes(i.region))),
      hands: t.some((i) => i.type === "accessory" && ["wrist", "finger"].includes(i.region)),
    };
  }

  start() { if (this.running) return; this.running = true; const n0 = performance.now(); this.lastSeen = { pose: n0, face: n0, hands: n0 }; const loop = () => { if (!this.running) return; this.tick(); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  /** Un-mirrored full-resolution camera frame for the AI pipeline. */
  captureFrame(): Promise<Blob | null> {
    const v = this.video, c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0);
    return new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  }

  private resize() {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5), cap = 1280;
    let w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    const k = Math.min(1, cap / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  private detect(t: number) {
    const v = this.video, n = this.needs();
    const both = n.pose && n.face;
    const f = this.frame++;
    try {
      if (n.pose && (!both || f % 2 === 0)) { const r = getPoseSync()?.detectForVideo(v, t); if (r?.landmarks[0]) { this.pose = r.landmarks[0]; this.lastSeen.pose = t; } }
      if (n.face && (!both || f % 2 === 1)) { const r = getFaceSync()?.detectForVideo(v, t); if (r?.faceLandmarks[0]) { this.face = r.faceLandmarks[0]; this.lastSeen.face = t; } }
      if (n.hands && f % 2 === 0) { const r = getHandsSync()?.detectForVideo(v, t); this.hands = r?.landmarks ?? []; if (this.hands.length) this.lastSeen.hands = t; }
    } catch { /* a dropped frame is fine */ }
    const stale = (k: "pose" | "face" | "hands", need: boolean) => need && t - this.lastSeen[k] > 1200;
    const lost = this.items.length > 0 && (stale("pose", n.pose) || stale("face", n.face) || stale("hands", n.hands && !n.pose && !n.face));
    if (lost !== this.lostState) { this.lostState = lost; this.onLost(lost); }
    if (stale("pose", n.pose)) this.pose = null;
    if (stale("face", n.face)) this.face = null;
    if (t - this.lastSeen.hands > 1200) this.hands = [];
  }

  private tick() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    this.resize();
    const cv = this.canvas, ctx = cv.getContext("2d")!;
    const cw = cv.width, ch = cv.height, vw = v.videoWidth, vh = v.videoHeight;
    const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
    const t = performance.now();
    this.detect(t);

    ctx.save();
    if (this.mirrored) { ctx.translate(cw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, ox, oy, vw * s, vh * s);
    // landmark -> canvas coords, smoothed with a One-Euro filter in video pixel space
    const P = (src: string, l: LM[], i: number): Pt => { const [x, y] = this.sm.get(`${src}${i}`, l[i].x * vw, l[i].y * vh, t); return [ox + x * s, oy + y * s]; };
    const order = [...this.items].sort((a, b) => rank(a) - rank(b));
    for (const it of order) {
      try {
        if (it.type === "garment" && this.pose) this.garment(ctx, it, (i) => P("p", this.pose!, i), (i) => (this.pose![i].visibility ?? 1) > 0.4);
        else if (it.type === "face_makeup" && this.face) this.makeup(ctx, it, (i) => P("f", this.face!, i));
        else if (it.type === "accessory") this.accessory(ctx, it, t, P);
      } catch { /* keep rendering */ }
    }
    ctx.restore();
    if (++this.fpsN >= 20) { this.fps = Math.round((this.fpsN * 1000) / (t - this.fpsT)); this.fpsT = t; this.fpsN = 0; }
  }

  // ---------------------------------------------------------------- garments
  private garment(ctx: CanvasRenderingContext2D, it: Item, P: (i: number) => Pt, vis: (i: number) => boolean) {
    if (!it.img || !vis(11) || !vis(12)) return;
    let a = P(11), b = P(12);
    if (a[0] > b[0]) [a, b] = [b, a]; // a = image-left shoulder
    const hasHips = vis(23) && vis(24);
    let c = hasHips ? P(23) : [a[0], a[1] + dist(a, b) * 1.5] as Pt, d = hasHips ? P(24) : [b[0], b[1] + dist(a, b) * 1.5] as Pt;
    if (c[0] > d[0]) [c, d] = [d, c];
    const ms = mid(a, b), mh = mid(c, d), shW = dist(a, b);
    const k = it.region === "torso_dress" ? 1.0 : it.region === "torso_long" ? 0.78 : -0.17; // fraction of hip→knee
    let hem = mh;
    if (k > 0) { const kn = vis(25) && vis(26) ? mid(P(25), P(26)) : [mh[0] + (mh[0] - ms[0]) * 0.9, mh[1] + (mh[1] - ms[1]) * 0.9] as Pt; hem = mid(mh, kn, k); }
    else hem = [mh[0] + (mh[0] - ms[0]) * 0.17, mh[1] + (mh[1] - ms[1]) * 0.17];
    const up = (v: Pt) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] as Pt; };
    const us = up([b[0] - a[0], b[1] - a[1]]), uh = up([d[0] - c[0], d[1] - c[1]]);
    const topHalf = shW * 0.82, botHalf = Math.max(shW, dist(c, d) * 1.4) * (it.region === "torso_dress" ? 0.8 : it.region === "torso_long" ? 0.78 : 0.7);
    const vt: Pt = [mh[0] - ms[0], mh[1] - ms[1]];
    const topC: Pt = [ms[0] - vt[0] * 0.1, ms[1] - vt[1] * 0.1];
    const quad: Pt[] = [
      [topC[0] - us[0] * topHalf, topC[1] - us[1] * topHalf], [topC[0] + us[0] * topHalf, topC[1] + us[1] * topHalf],
      [hem[0] + uh[0] * botHalf, hem[1] + uh[1] * botHalf], [hem[0] - uh[0] * botHalf, hem[1] - uh[1] * botHalf],
    ];
    drawQuad(ctx, it.img, quad, 6);
  }

  // ---------------------------------------------------------------- makeup
  private makeup(ctx: CanvasRenderingContext2D, it: Item, F: (i: number) => Pt) {
    const hex = it.shade || "#b3122c";
    const path = (idx: number[]) => { const p = new Path2D(); idx.forEach((i, k) => { const [x, y] = F(i); k ? p.lineTo(x, y) : p.moveTo(x, y); }); p.closePath(); return p; };
    const fw = dist(F(234), F(454));
    ctx.save();
    switch (it.region) {
      case "lips": {
        const p = new Path2D(); p.addPath(path(LIPS_OUTER)); p.addPath(path(LIPS_INNER));
        ctx.filter = `blur(${Math.max(0.5, fw * 0.004)}px)`; ctx.globalCompositeOperation = "color"; ctx.globalAlpha = 0.72; ctx.fillStyle = hex; ctx.fill(p, "evenodd");
        ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.5; ctx.fill(p, "evenodd"); break;
      }
      case "cheeks":
        for (const i of CHEEKS) { const [x, y] = F(i), r = fw * 0.17; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hex + "bb"); g.addColorStop(1, hex + "00"); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.6; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      case "eyelids":
        for (const up of [EYE_R_UP, EYE_L_UP]) {
          const pts = up.map((i) => F(i)), ew = dist(pts[0], pts[pts.length - 1]);
          const lifted = pts.map((p, k) => [p[0], p[1] - ew * (0.1 + 0.42 * Math.sin((Math.PI * k) / (pts.length - 1)))] as Pt);
          ctx.filter = `blur(${fw * 0.012}px)`; ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.5; ctx.fillStyle = hex;
          ctx.beginPath(); [...pts, ...lifted.reverse()].forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
        }
        break;
      case "eyeliner": case "waterline": {
        const sets = it.region === "eyeliner" ? [[EYE_R_UP, 133], [EYE_L_UP, 362]] : [[EYE_R_LO, 133], [EYE_L_LO, 362]];
        for (const [idx, inner] of sets as [number[], number][]) {
          let pts = idx.map((i) => F(i)); const ew = dist(pts[0], pts[pts.length - 1]);
          if (it.region === "eyeliner") { const o = pts[0], inn = F(inner); const dx = (o[0] - inn[0]) / ew, dy = (o[1] - inn[1]) / ew; pts = [...pts.slice().reverse(), [o[0] + dx * ew * 0.28, o[1] + dy * ew * 0.28 - ew * 0.14]]; } else pts = pts.slice(1, -1);
          ctx.globalAlpha = 0.9; ctx.strokeStyle = hex; ctx.lineWidth = Math.max(1.6, ew * (it.region === "eyeliner" ? 0.085 : 0.09)); ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        }
        break;
      }
      case "face": {
        const p = new Path2D(); p.addPath(path(FACE_OVAL));
        for (const h of [LIPS_OUTER, EYE_R_FULL, EYE_L_FULL, BROW_R, BROW_L]) p.addPath(path(h));
        ctx.filter = `blur(${fw * 0.012}px)`; ctx.globalCompositeOperation = "color"; ctx.globalAlpha = 0.28; ctx.fillStyle = hex; ctx.fill(p, "evenodd"); break;
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- accessories
  private accessory(ctx: CanvasRenderingContext2D, it: Item, t: number, P: (src: string, l: LM[], i: number) => Pt) {
    const img = it.img; if (!img) return;
    const aspect = img.height / img.width;
    const F = this.face, Po = this.pose;
    switch (it.region) {
      case "eyes": {
        if (!F) return;
        let l = P("f", F, 33), r = P("f", F, 263); if (l[0] > r[0]) [l, r] = [r, l];
        const w = dist(l, r) * 1.62, m = mid(l, r);
        drawRot(ctx, img, m[0], m[1] + w * aspect * 0.06, w, Math.atan2(r[1] - l[1], r[0] - l[0])); break;
      }
      case "head": {
        if (!F) return;
        let l = P("f", F, 234), r = P("f", F, 454); if (l[0] > r[0]) [l, r] = [r, l];
        const top = P("f", F, 10), chin = P("f", F, 152), fw = dist(l, r), fh = dist(top, chin);
        drawRot(ctx, img, top[0], top[1] + fh * 0.04, fw * 1.3, Math.atan2(r[1] - l[1], r[0] - l[0]), [0.5, 0.72]); break;
      }
      case "ears": {
        if (!F) return;
        const a1 = P("f", F, 234), a2 = P("f", F, 454), j1 = P("f", F, 172), j2 = P("f", F, 397);
        const sides = a1[0] < a2[0] ? [[a1, j1, -1], [a2, j2, 1]] : [[a2, j2, -1], [a1, j1, 1]];
        const fw = dist(a1, a2), eh = fw * 0.4, half = Math.floor(img.width / 2);
        sides.forEach(([ear, jaw, dir], k) => {
          const lobe = mid(ear as Pt, jaw as Pt, 0.4);
          const part = document.createElement("canvas"); part.width = k ? img.width - half : half; part.height = img.height;
          part.getContext("2d")!.drawImage(img, k ? half : 0, 0, part.width, part.height, 0, 0, part.width, part.height);
          drawRot(ctx, part, lobe[0] + (dir as number) * fw * 0.015, lobe[1], eh * (part.width / part.height), 0, [0.5, 0]);
        });
        break;
      }
      case "wrist": {
        let wrist: Pt | null = null, elbow: Pt | null = null, best = 0.4;
        if (Po) for (const [wi, ei] of [[15, 13], [16, 14]]) { const v = Po[wi].visibility ?? 1; if (v > best && (Po[ei].visibility ?? 1) > 0.3) { best = v; wrist = P("p", Po, wi); elbow = P("p", Po, ei); } }
        if (!wrist && this.hands[0]) { wrist = P("h0", this.hands[0], 0); const m9 = P("h0", this.hands[0], 9); elbow = [wrist[0] * 2 - m9[0], wrist[1] * 2 - m9[1]]; }
        if (!wrist || !elbow) return;
        const fl = dist(wrist, elbow), dir: Pt = [(elbow[0] - wrist[0]) / fl, (elbow[1] - wrist[1]) / fl];
        const band = aspect < 0.9, w = fl * (band ? 0.4 : 0.26);
        drawRot(ctx, img, wrist[0] + dir[0] * fl * 0.1, wrist[1] + dir[1] * fl * 0.1, w, Math.atan2(dir[1], dir[0]) + Math.PI / 2); break;
      }
      case "finger": {
        const h = this.hands[0]; if (!h) return;
        const m = P("h0", h, 13), q = P("h0", h, 14), c = mid(m, q, 0.45);
        drawRot(ctx, img, c[0], c[1], dist(m, q) * 0.9, Math.atan2(q[1] - m[1], q[0] - m[0]) + Math.PI / 2); break;
      }
      case "shoulder": {
        if (!Po) return;
        const ls = P("p", Po, 11), rs = P("p", Po, 12), lh = P("p", Po, 23), sw = dist(ls, rs);
        drawRot(ctx, img, lh[0] + (lh[0] - ls[0]) * 0.1 + sw * 0.1, lh[1] + sw * 0.05, sw * 0.62, 0); break;
      }
    }
    void t;
  }
}

const rank = (i: Item) => (i.type === "garment" ? 0 : i.type === "face_makeup" ? 1 : 2);

function drawRot(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, width: number, rad: number, anchor: Pt = [0.5, 0.5]) {
  const h = width * (img.height / img.width);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rad);
  ctx.drawImage(img, -width * anchor[0], -h * anchor[1], width, h);
  ctx.restore();
}

/** Draw `img` mapped onto a quadrilateral (tl, tr, br, bl) using an n×n grid of affine triangles (bilinear warp). */
function drawQuad(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, q: Pt[], n: number) {
  const [tl, tr, br, bl] = q, W = img.width, H = img.height;
  const at = (u: number, v: number): Pt => {
    const top = mid(tl, tr, u), bot = mid(bl, br, u);
    return mid(top, bot, v);
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
    const s = (u: number, v: number): Pt => [u * W, v * H];
    tri(ctx, img, s(u0, v0), s(u1, v0), s(u0, v1), at(u0, v0), at(u1, v0), at(u0, v1));
    tri(ctx, img, s(u1, v0), s(u1, v1), s(u0, v1), at(u1, v0), at(u1, v1), at(u0, v1));
  }
}

function tri(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, s0: Pt, s1: Pt, s2: Pt, d0: Pt, d1: Pt, d2: Pt) {
  const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (!det) return;
  const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det;
  const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det;
  const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / det;
  const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / det;
  const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
  // expand the clip a touch to hide hairline seams between triangles
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, k = 1.02;
  const ex = (p: Pt): Pt => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
  const [x0, x1, x2] = [ex(d0), ex(d1), ex(d2)];
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0[0], x0[1]); ctx.lineTo(x1[0], x1[1]); ctx.lineTo(x2[0], x2[1]); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// Synchronous handles to already-created landmarkers (created in setProducts via the async getters).
import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
let poseRef: PoseLandmarker | null = null, faceRef: FaceLandmarker | null = null, handsRef: HandLandmarker | null = null;
const getPoseSync = () => poseRef, getFaceSync = () => faceRef, getHandsSync = () => handsRef;
export async function primeLandmarkers(n: { pose: boolean; face: boolean; hands: boolean }) {
  if (n.pose) poseRef = await getPose("VIDEO");
  if (n.face) faceRef = await getFace("VIDEO");
  if (n.hands) handsRef = await getHands("VIDEO");
}
