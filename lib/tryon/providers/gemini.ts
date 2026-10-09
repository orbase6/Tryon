// Google Gemini image editing (GEMINI_API_KEY, GEMINI_MODEL). The mask is passed as a second image and the
// prompt forbids edits outside it; the pipeline additionally pixel-locks everything outside the mask.
import type { GarmentRenderInput } from "./index";
import { PROMPT } from "./index";

export async function geminiRender(i: GarmentRenderInput): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
  const part = (b: Buffer) => ({ inlineData: { mimeType: "image/png", data: b.toString("base64") } });
  const parts: unknown[] = [
    { text: PROMPT(i.name) + " Image 1 is the person photo, image 2 is the edit mask (white = editable), image 3 is the garment front" + (i.garmentBack ? ", image 4 is the garment back." : ".") + ` Return the edited photo at exactly ${i.width}x${i.height} pixels.` },
    part(i.person), part(i.mask), part(i.garmentFront),
  ];
  if (i.garmentBack) parts.push(part(i.garmentBack));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data;
  if (!out) throw new Error("Gemini returned no image");
  return Buffer.from(out, "base64");
}
