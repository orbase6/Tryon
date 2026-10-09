// Replicate IDM-VTON / CatVTON style models. Person + mask are letterboxed to 3:4 (the models' native
// aspect) and the result is cropped back, so alignment with the original photo is preserved.
import sharp from "sharp";
import type { GarmentRenderInput } from "./index";
import { replicateRun, toDataUri, fetchBuffer } from "./replicate";

export async function replicateRender(i: GarmentRenderInput): Promise<Buffer> {
  const model = process.env.REPLICATE_TRYON_MODEL || "cuuupid/idm-vton";
  const W = i.width, H = i.height;
  const targetAspect = 3 / 4;
  let PW = W, PH = H;
  if (W / H > targetAspect) PH = Math.round(W / targetAspect); else PW = Math.round(H * targetAspect);
  const left = Math.floor((PW - W) / 2), top = Math.floor((PH - H) / 2);
  const pad = (b: Buffer, bg: { r: number; g: number; b: number }) =>
    sharp(b).extend({ top, bottom: PH - H - top, left, right: PW - W - left, background: bg }).png().toBuffer();
  const person = await pad(i.person, { r: 127, g: 127, b: 127 });
  const mask = await pad(await sharp(i.mask).greyscale().toBuffer(), { r: 0, g: 0, b: 0 });
  const garm = await sharp(i.garmentFront).flatten({ background: "#ffffff" }).png().toBuffer();

  const out = await replicateRun(model, {
    human_img: toDataUri(person, "image/png"),
    garm_img: toDataUri(garm, "image/png"),
    mask_img: toDataUri(mask, "image/png"),
    garment_des: i.name,
    category: i.region === "torso_dress" ? "dresses" : "upper_body",
    is_checked: true, is_checked_crop: false, denoise_steps: 30, seed: 42,
  });
  const url = Array.isArray(out) ? out[0] : out;
  if (!url) throw new Error("Replicate returned no image");
  const img = await sharp(await fetchBuffer(String(url))).resize(PW, PH, { fit: "fill" }).toBuffer();
  return sharp(img).extract({ left, top, width: W, height: H }).png().toBuffer();
}
