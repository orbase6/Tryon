// Landmark-driven makeup: each product edits ONE facial area through a feathered polygon mask.
import type { Analysis } from "./types";
import { rasterize, blurMask, pts, px, dist, poly, type Pt } from "./raster";
import { tint, type Surface } from "./canvas";

import { LIPS_OUTER, LIPS_INNER, EYE_R_UP, EYE_L_UP, EYE_R_LO, EYE_L_LO, EYE_R_FULL, EYE_L_FULL, BROW_R, BROW_L, FACE_OVAL as OVAL, CHEEKS } from "../faceIndices";

export class MakeupError extends Error {}

export const MAKEUP_RANK: Record<string, number> = { face: 0, cheeks: 1, eyelids: 2, eyeliner: 3, waterline: 4, lips: 5 };

export async function applyMakeup(s: Surface, a: Analysis, region: string, hex: string) {
  if (!a.face || a.face.length < 468) throw new MakeupError("No face detected — upload a clearer, front-facing photo to try on makeup.");
  const { W, H } = s, f = a.face;
  const fw = dist(px(f[234], W, H), px(f[454], W, H));
  const P = (idx: number[]) => pts(f, idx, W, H);
  const sw = (n: number) => (fw * n).toFixed(2);
  let shapes = "", defs = "", sigma = fw * 0.006, strength = 0.7;

  switch (region) {
    case "lips":
      shapes = `<path fill-rule="evenodd" fill="#fff" d="M${poly(P(LIPS_OUTER))}Z M${poly(P(LIPS_INNER))}Z"/>`;
      // a closed mouth has a ~zero-area inner polygon, which evenodd handles; also fill thin gap
      shapes += `<polygon points="${poly(P(LIPS_INNER))}" fill="#fff" opacity="0"/>`;
      sigma = fw * 0.005; strength = 0.78; break;
    case "cheeks": {
      const r = fw * 0.16;
      defs = `<radialGradient id="b"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
      shapes = CHEEKS.map((i) => { const [x, y] = px(f[i], W, H); return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.78}" fill="url(#b)"/>`; }).join("");
      sigma = fw * 0.01; strength = 0.5; break;
    }
    case "eyelids": {
      const lids = [EYE_R_UP, EYE_L_UP].map((idx) => {
        const up = P(idx); const ew = dist(up[0], up[up.length - 1]);
        const lifted: Pt[] = up.map((p, k) => [p[0], p[1] - ew * (0.1 + 0.42 * Math.sin((Math.PI * k) / (up.length - 1)))] as Pt);
        return `<polygon points="${poly([...up, ...lifted.slice().reverse()])}" fill="#fff"/>`;
      });
      shapes = lids.join(""); sigma = fw * 0.012; strength = 0.55; break;
    }
    case "eyeliner": {
      shapes = [[EYE_R_UP, 133], [EYE_L_UP, 362]].map(([idx, inner]) => {
        const up = P(idx as number[]); const ew = dist(up[0], up[up.length - 1]);
        const outer = up[0], innerPt = px(f[inner as number], W, H);
        const dir: Pt = [(outer[0] - innerPt[0]) / ew, (outer[1] - innerPt[1]) / ew];
        const wing: Pt = [outer[0] + dir[0] * ew * 0.28, outer[1] + dir[1] * ew * 0.28 - ew * 0.14];
        return `<polyline points="${poly([up[up.length - 1], ...up.slice().reverse().slice(1), wing])}" fill="none" stroke="#fff" stroke-width="${Math.max(1.6, ew * 0.085)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join("");
      sigma = Math.max(0.5, fw * 0.003); strength = 0.92; break;
    }
    case "waterline":
      shapes = [EYE_R_LO, EYE_L_LO].map((idx) => { const lo = P(idx); const ew = dist(lo[0], lo[lo.length - 1]);
        return `<polyline points="${poly(lo.slice(1, -1))}" fill="none" stroke="#fff" stroke-width="${Math.max(1.4, ew * 0.09)}" stroke-linecap="round" stroke-linejoin="round"/>`; }).join("");
      sigma = Math.max(0.5, fw * 0.003); strength = 0.88; break;
    case "face": {
      const holes = [LIPS_OUTER, EYE_R_FULL, EYE_L_FULL, BROW_R, BROW_L].map((idx) => `<polygon points="${poly(P(idx))}" fill="#000" stroke="#000" stroke-width="${sw(0.012)}"/>`).join("");
      shapes = `<polygon points="${poly(P(OVAL))}" fill="#fff"/>` + holes;
      sigma = fw * 0.018; strength = 0.4; break;
    }
    default:
      throw new MakeupError(`Unsupported makeup region "${region}"`);
  }
  const raw = await rasterize(W, H, shapes, defs);
  const mask = await blurMask(raw, W, H, sigma);
  tint(s, mask, hex, strength);
}
