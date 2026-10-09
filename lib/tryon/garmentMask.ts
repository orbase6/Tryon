// Builds the edit mask for garments: expected garment area (from pose) ∪ the clothing currently worn,
// minus face / hair / hands so they stay pixel-identical and keep occluding the garment.
import { CLS, type Analysis, type Parsing, type Box } from "./types";
import { rasterize, blurMask, maskBox, px, pts, dist, lerpPt, poly, type Pt } from "./raster";

export { FACE_OVAL } from "../faceIndices";
import { FACE_OVAL } from "../faceIndices";

export interface GarmentMaskResult { mask: Uint8Array; box: Box; approx: boolean }

function defaultPose(W: number, H: number): { ls: Pt; rs: Pt; lh: Pt; rh: Pt; lk: Pt; rk: Pt; le: Pt; re: Pt; lw: Pt; rw: Pt } {
  return {
    ls: [W * 0.62, H * 0.3], rs: [W * 0.38, H * 0.3], lh: [W * 0.58, H * 0.58], rh: [W * 0.42, H * 0.58],
    lk: [W * 0.58, H * 0.8], rk: [W * 0.42, H * 0.8], le: [W * 0.7, H * 0.44], re: [W * 0.3, H * 0.44], lw: [W * 0.72, H * 0.58], rw: [W * 0.28, H * 0.58],
  };
}

export async function buildGarmentMask(a: Analysis, parsing: Parsing | null, region: string, W: number, H: number): Promise<GarmentMaskResult> {
  const p = a.pose;
  const ok = (i: number) => !!p && !!p[i] && (p[i].v ?? 1) > 0.3;
  const approx = !(ok(11) && ok(12) && ok(23) && ok(24));
  const d = defaultPose(W, H);
  const get = (i: number, fb: Pt): Pt => (ok(i) ? px(p![i], W, H) : fb);
  let ls = get(11, d.ls), rs = get(12, d.rs), lh = get(23, d.lh), rh = get(24, d.rh);
  if (ok(11) && ok(12) && !(ok(23) && ok(24))) { // derive hips from shoulders
    const sw = dist(ls, rs);
    lh = [ls[0], ls[1] + sw * 1.45]; rh = [rs[0], rs[1] + sw * 1.45];
  }
  const sw = dist(ls, rs);
  const torsoLen = (dist(ls, lh) + dist(rs, rh)) / 2;
  const lk = ok(25) ? px(p![25], W, H) : [lh[0], lh[1] + torsoLen * 1.0] as Pt;
  const rk = ok(26) ? px(p![26], W, H) : [rh[0], rh[1] + torsoLen * 1.0] as Pt;
  const le = get(13, [ls[0] + sw * 0.15, ls[1] + torsoLen * 0.5]), re = get(14, [rs[0] - sw * 0.15, rs[1] + torsoLen * 0.5]);
  const lw = get(15, [le[0], le[1] + torsoLen * 0.45]), rw = get(16, [re[0], re[1] + torsoLen * 0.45]);

  const dress = region === "torso_dress", long = region === "torso_long";
  const k = dress ? 1.0 : long ? 0.8 : 0;
  let hemL: Pt, hemR: Pt;
  if (k > 0) { hemL = lerpPt(lh, lk, k); hemR = lerpPt(rh, rk, k); }
  else { hemL = [lh[0] + (lh[0] - ls[0]) * 0.18, lh[1] + (lh[1] - ls[1]) * 0.16]; hemR = [rh[0] + (rh[0] - rs[0]) * 0.18, rh[1] + (rh[1] - rs[1]) * 0.16]; }

  const armW = sw * 0.38;
  const sleeve = (s: Pt, e: Pt, w: Pt) => {
    const end = dress ? lerpPt(s, e, 0.6) : w;
    const mid = dress ? end : e;
    return `<polyline points="${poly([s, mid, end])}" fill="none" stroke="#fff" stroke-width="${armW}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  const stroke = Math.max(6, sw * 0.16);
  // Raise the top edge towards the neck so the area between neck and shoulder tips (trapezius) is editable;
  // otherwise a round-neck garment keeps a wide, shoulder-to-shoulder neckline of the old skin/clothes.
  const mS = lerpPt(ls, rs, 0.5), mH = lerpPt(lh, rh, 0.5);
  const tl = Math.hypot(mS[0] - mH[0], mS[1] - mH[1]) || 1;
  const up: Pt = [(mS[0] - mH[0]) / tl, (mS[1] - mH[1]) / tl];
  const along = (t: number, raise: number): Pt => { const b = lerpPt(ls, rs, t); return [b[0] + up[0] * sw * raise, b[1] + up[1] * sw * raise]; };
  const top = [ls, along(0.2, 0.1), along(0.36, 0.09), along(0.5, 0.05), along(0.64, 0.09), along(0.8, 0.1), rs];
  const shapes =
    `<polygon points="${poly([...top, hemR, hemL])}" fill="#fff" stroke="#fff" stroke-width="${stroke}" stroke-linejoin="round"/>` +
    sleeve(ls, le, lw) + sleeve(rs, re, rw);
  const add = await rasterize(W, H, shapes);

  // existing garment pixels (replace completely)
  if (parsing) {
    const minX = Math.max(0, Math.min(ls[0], rs[0], hemL[0], hemR[0], lw[0], rw[0]) - sw * 0.5);
    const maxX = Math.min(W, Math.max(ls[0], rs[0], hemL[0], hemR[0], lw[0], rw[0]) + sw * 0.5);
    const topY = Math.min(ls[1], rs[1]) - sw * 0.25;
    const botY = dress ? H : Math.max(hemL[1], hemR[1]) + torsoLen * 0.05;
    for (let y = Math.max(0, Math.floor(topY)); y < Math.min(H, Math.ceil(botY)); y++)
      for (let x = Math.floor(minX); x < maxX; x++) if (parsing.labels[y * W + x] === CLS.CLOTHES) add[y * W + x] = 255;
  }

  // protect face / hair / hands
  const sub: string[] = [];
  if (a.face) sub.push(`<polygon points="${poly(pts(a.face, FACE_OVAL, W, H))}" fill="#fff" stroke="#fff" stroke-width="${Math.max(4, sw * 0.05)}" stroke-linejoin="round"/>`);
  else if (ok(0)) sub.push(`<circle cx="${px(p![0], W, H)[0]}" cy="${px(p![0], W, H)[1]}" r="${sw * 0.42}" fill="#fff"/>`);
  for (const h of a.hands) {
    const hp = pts(h.landmarks, [0, 4, 8, 12, 16, 20, 5, 17], W, H);
    sub.push(`<polygon points="${poly(hp)}" fill="#fff" stroke="#fff" stroke-width="${sw * 0.07}" stroke-linejoin="round"/>`);
  }
  if (!a.hands.length) for (const [w, i1, i2] of [[lw, 19, 21], [rw, 20, 22]] as [Pt, number, number][]) {
    if (!(ok(i1) && ok(i2))) continue;
    const hx = (px(p![i1], W, H)[0] + px(p![i2], W, H)[0]) / 2, hy = (px(p![i1], W, H)[1] + px(p![i2], W, H)[1]) / 2;
    sub.push(`<circle cx="${(hx + w[0]) / 2}" cy="${(hy + w[1]) / 2}" r="${Math.max(dist(w, [hx, hy]) * 0.9, sw * 0.12)}" fill="#fff"/>`);
  }
  const subM = await rasterize(W, H, sub.join(""));
  if (parsing) for (let i = 0; i < subM.length; i++) {
    const c = parsing.labels[i];
    if (c === CLS.HAIR || c === CLS.FACE) subM[i] = 255;
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = subM[i] > 127 ? 0 : add[i];
  const feathered = await blurMask(out, W, H, Math.max(1.5, Math.max(W, H) * 0.0035));
  const box = maskBox(feathered, W, H) ?? { x0: 0, y0: 0, x1: W, y1: H };
  return { mask: feathered, box, approx };
}

/** Face region used by the safety check. */
export function faceBox(a: Analysis, parsing: Parsing | null, W: number, H: number): Box | null {
  let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
  if (a.face) for (const l of a.face) { n++; x0 = Math.min(x0, l.x * W); x1 = Math.max(x1, l.x * W); y0 = Math.min(y0, l.y * H); y1 = Math.max(y1, l.y * H); }
  else if (parsing) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (parsing.labels[y * W + x] === CLS.FACE) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (n < 10) return null;
  const mx = (x1 - x0) * 0.1, my = (y1 - y0) * 0.1;
  return { x0: Math.max(0, Math.floor(x0 - mx)), y0: Math.max(0, Math.floor(y0 - my)), x1: Math.min(W, Math.ceil(x1 + mx)), y1: Math.min(H, Math.ceil(y1 + my)) };
}
