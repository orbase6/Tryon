// Free option: calls the public IDM-VTON Hugging Face Space (default yisol/IDM-VTON) through @gradio/client.
// Slow, queued and rate limited; set HF_TOKEN (free account) for a larger GPU quota. Not for production.
// Our edit mask is sent as the Space's drawing layer and its own auto-masking is switched off, so only the masked
// area changes. Person + mask are letterboxed to the model's 3:4 aspect and cropped back afterwards.
import sharp from "sharp";
import type { GarmentRenderInput } from "./index";

export async function huggingfaceRender(i: GarmentRenderInput): Promise<Buffer> {
  const space = process.env.HF_SPACE || "yisol/IDM-VTON";
  const token = (process.env.HF_TOKEN || "").trim() || undefined;
  const { Client } = await import("@gradio/client");

  const W = i.width, H = i.height, aspect = 3 / 4;
  let PW = W, PH = H;
  if (W / H > aspect) PH = Math.round(W / aspect); else PW = Math.round(H * aspect);
  const left = Math.floor((PW - W) / 2), top = Math.floor((PH - H) / 2);
  const extend = (b: Buffer, bg: { r: number; g: number; b: number; alpha?: number }) =>
    sharp(b).extend({ top, bottom: PH - H - top, left, right: PW - W - left, background: bg }).png().toBuffer();

  const person = await extend(i.person, { r: 127, g: 127, b: 127 });
  // drawing layer: opaque white where we allow edits, transparent elsewhere
  const m = await sharp(i.mask).greyscale().raw().toBuffer();
  const rgba = Buffer.alloc(W * H * 4);
  // The Space reads the layer as RGB (alpha dropped), so unmasked pixels must be black, not just transparent.
  for (let k = 0; k < W * H; k++) { const v = m[k] > 100 ? 255 : 0; rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = v; rgba[k * 4 + 3] = v; }
  const layer = await extend(await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), { r: 0, g: 0, b: 0, alpha: 0 });
  const garm = await sharp(i.garmentFront).flatten({ background: "#ffffff" }).png().toBuffer();
  const blob = (b: Buffer) => new Blob([new Uint8Array(b)], { type: "image/png" });

  const client = await Client.connect(space, token ? { hf_token: token as `hf_${string}` } : undefined);
  const res = await client.predict("/tryon", {
    dict: { background: blob(person), layers: [blob(layer)], composite: null },
    garm_img: blob(garm),
    garment_des: i.name,
    is_checked: false,       // do NOT use the Space's auto-mask — use ours
    is_checked_crop: false,
    denoise_steps: 30,
    seed: 42,
  });
  const out = (res.data as { url?: string; path?: string }[])[0];
  if (!out?.url) throw new Error("Hugging Face Space returned no image");
  const r = await fetch(out.url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  const img = await sharp(Buffer.from(await r.arrayBuffer())).resize(PW, PH, { fit: "fill" }).toBuffer();
  return sharp(img).extract({ left, top, width: W, height: H }).png().toBuffer();
}
