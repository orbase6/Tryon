// Demo mode: no AI key needed. Fits the garment cutout to the edit-mask bounds so the whole
// pipeline (mask -> composite -> face check) runs end to end. Results are flagged `demo`.
import sharp from "sharp";
import type { GarmentRenderInput } from "./index";

export async function mockRender(i: GarmentRenderInput): Promise<Buffer> {
  const { x0, y0, x1, y1 } = i.maskBox;
  const bw = Math.max(8, x1 - x0), bh = Math.max(8, y1 - y0);
  const g = await sharp(i.garmentFront).ensureAlpha().trim({ threshold: 2 }).toBuffer().catch(() => i.garmentFront);
  const resized = await sharp(g).resize(bw, bh, { fit: "fill" }).png().toBuffer();
  return sharp(i.person).composite([{ input: resized, left: Math.max(0, x0), top: Math.max(0, y0) }]).png().toBuffer();
}
