// Demo mode: no AI key needed. Fits the garment cutout to the edit-mask bounds so the whole
// pipeline (mask -> composite -> face check) runs end to end. Results are flagged `demo`.
// Old clothing inside the mask that the new cutout does not cover is painted over with the nearest
// background colour on the same row, so remnants (e.g. old sleeves) don't show through.
import sharp from "sharp";
import type { GarmentRenderInput } from "./index";

export async function mockRender(i: GarmentRenderInput): Promise<Buffer> {
  const { x0, y0, x1, y1 } = i.maskBox;
  const W = i.width, H = i.height;
  const bw = Math.max(8, x1 - x0), bh = Math.max(8, y1 - y0);
  const g = await sharp(i.garmentFront).ensureAlpha().trim({ threshold: 2 }).toBuffer().catch(() => i.garmentFront);
  const resized = await sharp(g).resize(bw, bh, { fit: "fill" }).ensureAlpha().raw().toBuffer();

  const person = new Uint8Array((await sharp(i.person).removeAlpha().raw().toBuffer()));
  const mask = await sharp(i.mask).greyscale().raw().toBuffer();
  const out = new Uint8Array(person);
  const covered = new Uint8Array(W * H);

  // 1) paint the garment
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const px = x + x0, py = y + y0;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const a = resized[(y * bw + x) * 4 + 3] / 255;
    if (a < 0.02) continue;
    const j = (py * W + px) * 3, s = (y * bw + x) * 4;
    for (let c = 0; c < 3; c++) out[j + c] = person[j + c] * (1 - a) + resized[s + c] * a;
    if (a > 0.5) covered[py * W + px] = 1;
  }
  // 2) erase leftover old clothing: uncovered mask pixels take the nearest non-mask colour on their row
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i0 = y * W + x;
      if (mask[i0] < 128 || covered[i0]) continue;
      let l = x, r = x;
      while (l > 0 && mask[y * W + l] >= 128) l--;
      while (r < W - 1 && mask[y * W + r] >= 128) r++;
      const useL = x - l <= r - x;
      const sx = useL ? l : r, sj = (y * W + sx) * 3, j = i0 * 3;
      for (let c = 0; c < 3; c++) out[j + c] = person[sj + c];
    }
  }
  return sharp(Buffer.from(out.buffer), { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}
