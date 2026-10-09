import sharp from "sharp";
import type { LM, Box } from "./types";

export type Pt = [number, number];
export const px = (l: LM, W: number, H: number): Pt => [l.x * W, l.y * H];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const pts = (lms: LM[], idx: number[], W: number, H: number): Pt[] => idx.map((i) => px(lms[i], W, H));
export const poly = (p: Pt[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");

/** Rasterize white SVG shapes on black into a single-channel 0..255 buffer. */
export async function rasterize(W: number, H: number, shapes: string, defs = ""): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="100%" height="100%" fill="#000"/>${shapes}</svg>`;
  const { data } = await sharp(Buffer.from(svg)).removeAlpha().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data.buffer, data.byteOffset, W * H);
}

export async function blurMask(m: Uint8Array, W: number, H: number, sigma: number): Promise<Uint8Array> {
  if (sigma < 0.3) return m;
  const out = await sharp(Buffer.from(m.buffer, m.byteOffset, m.length), { raw: { width: W, height: H, channels: 1 } }).blur(sigma).toColourspace("b-w").raw().toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, W * H);
}

export function maskBox(m: Uint8Array, W: number, H: number, th = 100): Box | null {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export const pngGray = (m: Uint8Array, W: number, H: number) =>
  sharp(Buffer.from(m.buffer, m.byteOffset, m.length), { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
