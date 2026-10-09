// Landmark-driven accessory overlays (scale + rotation from landmarks). Edits only the overlay footprint.
import sharp from "sharp";
import type { Analysis, LM } from "./types";
import { px, dist, lerpPt, type Pt } from "./raster";
import { blendRGBA, type Surface } from "./canvas";

export class AccessoryError extends Error {}

export const ACCESSORY_RANK: Record<string, number> = { ears: 0, wrist: 1, finger: 2, shoulder: 3, eyes: 4, head: 5 };

async function tightCutout(buf: Buffer): Promise<Buffer> {
  const png = await sharp(buf).ensureAlpha().png().toBuffer();
  try { return await sharp(png).trim({ threshold: 2 }).png().toBuffer(); } catch { return png; }
}

/** Resize to `width`, rotate by `rad` around the centre, and blend with its centre at (cx, cy). */
async function place(s: Surface, cutout: Buffer, width: number, rad: number, cx: number, cy: number, anchor: Pt = [0.5, 0.5]) {
  const w = Math.max(4, Math.round(width));
  const resized = await sharp(cutout).resize({ width: w }).toBuffer();
  const rm = await sharp(resized).metadata();
  const rot = await sharp(resized).rotate((rad * 180) / Math.PI, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // anchor is expressed in the un-rotated cutout; rotate the offset from its centre so rotation pivots on the anchor
  const ox = (anchor[0] - 0.5) * rm.width!, oy = (anchor[1] - 0.5) * rm.height!;
  const rx = ox * Math.cos(rad) - oy * Math.sin(rad), ry = ox * Math.sin(rad) + oy * Math.cos(rad);
  blendRGBA(s, rot.data, rot.info.width, rot.info.height, Math.round(cx - rx - rot.info.width / 2), Math.round(cy - ry - rot.info.height / 2));
}

const vis = (l?: LM, th = 0.4) => !!l && (l.v ?? 1) > th;

export async function applyAccessory(s: Surface, a: Analysis, region: string, subcategory: string | null, cutoutBuf: Buffer) {
  const { W, H } = s, f = a.face, p = a.pose;
  const cut = await tightCutout(cutoutBuf);
  const cm = await sharp(cut).metadata();
  const aspect = cm.height! / cm.width!;
  const needFace = () => { if (!f || f.length < 468) throw new AccessoryError("No face detected — upload a clearer, front-facing photo."); return f; };

  switch (region) {
    case "eyes": {
      const F = needFace();
      const e1 = px(F[33], W, H), e2 = px(F[263], W, H);
      const left = e1[0] < e2[0] ? e1 : e2, right = e1[0] < e2[0] ? e2 : e1;
      const eyeDist = dist(left, right);
      const mid = lerpPt(left, right, 0.5);
      const angle = Math.atan2(right[1] - left[1], right[0] - left[0]);
      const width = eyeDist * 1.62;
      await place(s, cut, width, angle, mid[0], mid[1] + width * aspect * 0.06);
      return;
    }
    case "ears": {
      const F = needFace();
      const fw = dist(px(F[234], W, H), px(F[454], W, H));
      const a1 = px(F[234], W, H), a2 = px(F[454], W, H);
      const j1 = px(F[172], W, H), j2 = px(F[397], W, H);
      const sides: [Pt, Pt, number][] = a1[0] < a2[0] ? [[a1, j1, -1], [a2, j2, 1]] : [[a2, j2, -1], [a1, j1, 1]];
      const half = Math.floor(cm.width! / 2);
      const halves = [await sharp(cut).extract({ left: 0, top: 0, width: half, height: cm.height! }).toBuffer(), await sharp(cut).extract({ left: half, top: 0, width: cm.width! - half, height: cm.height! }).toBuffer()];
      const eh = fw * 0.4; // earring height relative to face width
      for (let k = 0; k < 2; k++) {
        const [ear, jaw, dir] = sides[k];
        const lobe = lerpPt(ear, jaw, 0.4);
        const w = eh * ((cm.width! / 2) / cm.height!);
        await place(s, halves[k], w, 0, lobe[0] + dir * fw * 0.015, lobe[1], [0.5, 0.0]);
      }
      return;
    }
    case "head": {
      const F = needFace();
      const l = px(F[234], W, H), r = px(F[454], W, H), top = px(F[10], W, H), chin = px(F[152], W, H);
      const fw = dist(l, r), fh = dist(top, chin);
      const angle = Math.atan2(r[1] - l[1], r[0] - l[0]);
      await place(s, cut, fw * 1.3, angle, top[0], top[1] + fh * 0.04, [0.5, 0.72]);
      return;
    }
    case "wrist": {
      let wrist: Pt | null = null, elbow: Pt | null = null;
      const cands: [number, number][] = [[15, 13], [16, 14]];
      let best = -1;
      if (p) for (const [wi, ei] of cands) if (vis(p[wi]) && vis(p[ei]) && (p[wi].v ?? 1) > best) { best = p[wi].v ?? 1; wrist = px(p[wi], W, H); elbow = px(p[ei], W, H); }
      if (!wrist || !elbow) { // hand landmarks fallback
        const h = a.hands[0];
        if (!h) throw new AccessoryError("Wrist not visible — show your hand/arm in the photo.");
        wrist = px(h.landmarks[0], W, H);
        const mcp = px(h.landmarks[9], W, H);
        elbow = [wrist[0] * 2 - mcp[0], wrist[1] * 2 - mcp[1]];
      }
      const fl = dist(wrist, elbow);
      const dir: Pt = [(elbow[0] - wrist[0]) / fl, (elbow[1] - wrist[1]) / fl];
      const angle = Math.atan2(dir[1], dir[0]) + Math.PI / 2; // image "up" -> along the forearm
      const isBand = aspect < 0.9; // wide ring-like cutouts (bracelets) vs tall watch cutouts
      const width = fl * (isBand ? 0.4 : 0.26);
      const c: Pt = [wrist[0] + dir[0] * fl * 0.1, wrist[1] + dir[1] * fl * 0.1];
      await place(s, cut, width, angle, c[0], c[1]);
      return;
    }
    case "finger": {
      const h = a.hands.find((x) => x.landmarks.length >= 21);
      if (!h) throw new AccessoryError("Hand not detected — show your hand in the photo to try on rings.");
      const m = px(h.landmarks[13], W, H), q = px(h.landmarks[14], W, H);
      const fl = dist(m, q);
      const c = lerpPt(m, q, 0.45);
      await place(s, cut, fl * 0.9, Math.atan2(q[1] - m[1], q[0] - m[0]) + Math.PI / 2, c[0], c[1]);
      return;
    }
    case "shoulder": {
      if (!p || !vis(p[11]) || !vis(p[12]) || !vis(p[23])) throw new AccessoryError("Upper body not visible — use a photo showing your shoulders and hips.");
      const ls = px(p[11], W, H), rs = px(p[12], W, H), lh = px(p[23], W, H);
      const sw = dist(ls, rs);
      await place(s, cut, sw * 0.62, 0, lh[0] + (lh[0] - ls[0]) * 0.1 + sw * 0.1, lh[1] + sw * 0.05);
      return;
    }
    default:
      throw new AccessoryError(`Unsupported accessory region "${region}"`);
  }
}
