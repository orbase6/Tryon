// Background-removal adapter. Provider is chosen via BG_REMOVAL_PROVIDER:
//   heuristic (default, no key)  -> border-colour flood fill, works well on studio / plain backgrounds
//   removebg                     -> https://www.remove.bg API (REMOVEBG_API_KEY)
//   imgly                        -> @imgly/background-removal-node (install it yourself; optional dependency)
//   none                         -> keep the image as-is
import sharp from "sharp";

export interface CutoutResult { png: Buffer; provider: string; skipped?: boolean }

export async function hasTransparency(buf: Buffer): Promise<boolean> {
  const meta = await sharp(buf).metadata();
  if (!meta.hasAlpha) return false;
  const { channels } = await sharp(buf).stats();
  const alpha = channels[3];
  return !!alpha && alpha.min < 250;
}

export async function removeBackground(input: Buffer): Promise<CutoutResult> {
  if (await hasTransparency(input)) {
    return { png: await sharp(input).png().toBuffer(), provider: "existing-alpha", skipped: true };
  }
  const provider = (process.env.BG_REMOVAL_PROVIDER || "heuristic").toLowerCase();
  try {
    if (provider === "none") return { png: await sharp(input).ensureAlpha().png().toBuffer(), provider, skipped: true };
    if (provider === "removebg") return { png: await removeBg(input), provider };
    if (provider === "imgly") return { png: await imgly(input), provider };
  } catch (e) {
    console.warn(`[cutout] ${provider} failed, using heuristic:`, (e as Error).message);
  }
  return { png: await heuristicCutout(input), provider: "heuristic" };
}

async function removeBg(input: Buffer): Promise<Buffer> {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) throw new Error("REMOVEBG_API_KEY missing");
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(input)]), "image.png");
  form.append("size", "auto");
  form.append("format", "png");
  const res = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": key }, body: form });
  if (!res.ok) throw new Error(`remove.bg ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function imgly(input: Buffer): Promise<Buffer> {
  const pkg = "@imgly/background-removal-node";
  const mod = await import(/* webpackIgnore: true */ pkg);
  const blob = await mod.removeBackground(new Blob([new Uint8Array(input)], { type: "image/png" }));
  return Buffer.from(await blob.arrayBuffer());
}

/**
 * Flood-fill background removal. Estimates the background colour from the image border, marks pixels
 * close to it that are connected to the border as background, then smooths the matte.
 */
export async function heuristicCutout(input: Buffer): Promise<Buffer> {
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const W = meta.width!, H = meta.height!;
  const scale = Math.min(1, 900 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * scale)), h = Math.max(8, Math.round(H * scale));
  const { data } = await sharp(input).rotate().flatten({ background: "#ffffff" }).resize(w, h).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  // border samples -> median colour
  const samples: number[][] = [];
  const take = (x: number, y: number) => { const i = (y * w + x) * 3; samples.push([data[i], data[i + 1], data[i + 2]]); };
  for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
  const med = [0, 1, 2].map((c) => { const v = samples.map((s) => s[c]).sort((a, b) => a - b); return v[v.length >> 1]; });

  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const dr = data[i * 3] - med[0], dg = data[i * 3 + 1] - med[1], db = data[i * 3 + 2] - med[2];
    dist[i] = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.9;
  }
  const TH = 26; // tolerance relative to the background colour
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => { const i = y * w + x; if (!bg[i] && dist[i] < TH) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const alpha = Buffer.alloc(w * h);
  let fg = 0;
  for (let i = 0; i < w * h; i++) { alpha[i] = bg[i] ? 0 : 255; if (!bg[i]) fg++; }
  // If nothing (or almost everything) was removed, background isn't separable -> keep the image.
  const ratio = fg / (w * h);
  if (ratio > 0.985 || ratio < 0.01) return sharp(input).rotate().ensureAlpha().png().toBuffer();

  // smooth matte: blur, then threshold-ish contrast stretch
  const matte = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(1.6).linear(2.4, -150).resize(W, H, { kernel: "cubic" }).blur(0.6).toColourspace("b-w").raw().toBuffer();
  const rgb = await sharp(input).rotate().removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).joinChannel(matte, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}
