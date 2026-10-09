import sharp from "sharp";

/** RGB working surface. `orig` is never modified; `edit` records every pixel any layer touched. */
export interface Surface { W: number; H: number; orig: Uint8Array; work: Uint8Array; edit: Uint8Array }

export async function loadSurface(png: Buffer): Promise<Surface> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const orig = new Uint8Array(data.buffer, data.byteOffset, data.length);
  return { W: info.width, H: info.height, orig, work: new Uint8Array(orig), edit: new Uint8Array(info.width * info.height) };
}

export const surfaceToPng = (s: Surface, work = s.work) =>
  sharp(Buffer.from(work.buffer, work.byteOffset, work.length), { raw: { width: s.W, height: s.H, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();

/** Pixel-lock composite: work = lerp(work, candidate, mask). Outside mask nothing changes. */
export function compositeCandidate(s: Surface, cand: Uint8Array, mask: Uint8Array) {
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    if (!m) continue;
    const a = m / 255, j = i * 3;
    s.work[j] = s.work[j] * (1 - a) + cand[j] * a;
    s.work[j + 1] = s.work[j + 1] * (1 - a) + cand[j + 1] * a;
    s.work[j + 2] = s.work[j + 2] * (1 - a) + cand[j + 2] * a;
    if (m > s.edit[i]) s.edit[i] = m;
  }
}

export async function loadRaw(png: Buffer, W: number, H: number): Promise<Uint8Array> {
  const { data } = await sharp(png).removeAlpha().resize(W, H, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data.buffer, data.byteOffset, data.length);
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = parseInt(m ? m[1] : "b3122c", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luminance-preserving tint: keeps skin texture / highlights while shifting the hue to `hex`. */
export function tint(s: Surface, mask: Uint8Array, hex: string, strength: number) {
  const [r, g, b] = hexToRgb(hex);
  let sum = 0, wsum = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 20) { const j = i * 3; sum += (0.299 * s.orig[j] + 0.587 * s.orig[j + 1] + 0.114 * s.orig[j + 2]) * mask[i]; wsum += mask[i]; }
  if (!wsum) return;
  const ref = Math.max(30, sum / wsum);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const j = i * 3;
    const a = (mask[i] / 255) * strength;
    const L = 0.299 * s.work[j] + 0.587 * s.work[j + 1] + 0.114 * s.work[j + 2];
    const f = Math.min(1.45, Math.max(0.5, L / ref));
    s.work[j] = s.work[j] * (1 - a) + Math.min(255, r * f) * a;
    s.work[j + 1] = s.work[j + 1] * (1 - a) + Math.min(255, g * f) * a;
    s.work[j + 2] = s.work[j + 2] * (1 - a) + Math.min(255, b * f) * a;
    if (mask[i] > s.edit[i]) s.edit[i] = mask[i];
  }
}

/** Alpha-blend an RGBA bitmap at (left, top) — used for accessory overlays. */
export function blendRGBA(s: Surface, rgba: Buffer, w: number, h: number, left: number, top: number) {
  for (let y = 0; y < h; y++) {
    const dy = y + top;
    if (dy < 0 || dy >= s.H) continue;
    for (let x = 0; x < w; x++) {
      const dx = x + left;
      if (dx < 0 || dx >= s.W) continue;
      const si = (y * w + x) * 4, a = rgba[si + 3];
      if (!a) continue;
      const di = dy * s.W + dx, j = di * 3, f = a / 255;
      s.work[j] = s.work[j] * (1 - f) + rgba[si] * f;
      s.work[j + 1] = s.work[j + 1] * (1 - f) + rgba[si + 1] * f;
      s.work[j + 2] = s.work[j + 2] * (1 - f) + rgba[si + 2] * f;
      if (a > s.edit[di]) s.edit[di] = a;
    }
  }
}

/** Mean absolute difference between two RGB buffers inside `box`, skipping pixels where exclude > 8. */
export function regionDiff(a: Uint8Array, b: Uint8Array, W: number, box: { x0: number; y0: number; x1: number; y1: number }, exclude?: Uint8Array): number {
  let sum = 0, n = 0;
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const i = y * W + x;
    if (exclude && exclude[i] > 8) continue;
    const j = i * 3;
    sum += Math.abs(a[j] - b[j]) + Math.abs(a[j + 1] - b[j + 1]) + Math.abs(a[j + 2] - b[j + 2]);
    n += 3;
  }
  return n ? sum / n : 0;
}
