// AI try-on / inpainting adapter. Choose with TRYON_PROVIDER = mock | gemini | replicate.
import { geminiRender } from "./gemini";
import { replicateRender } from "./replicateTryon";
import { mockRender } from "./mock";
import { huggingfaceRender } from "./huggingface";

export interface GarmentRenderInput {
  person: Buffer;        // PNG, full user photo
  mask: Buffer;          // PNG greyscale, white = region the model may change
  garmentFront: Buffer;  // PNG cutout (transparent bg)
  garmentBack: Buffer | null;
  name: string;
  region: string;        // torso | torso_long | torso_dress
  width: number;
  height: number;
  maskBox: { x0: number; y0: number; x1: number; y1: number };
}
export interface GarmentRenderOutput { image: Buffer; demo: boolean; provider: string }

export const PROMPT = (name: string) =>
  `Virtual try-on edit. Dress the person in the provided garment ("${name}"). Change ONLY the pixels inside the white mask region. ` +
  `Everything outside the mask — the face, eyes, nose, mouth, expression, hair, skin tone, hands, body pose, proportions and the background — ` +
  `must remain exactly unchanged. Do not re-pose, re-frame, crop or resize the person. Replace any garment currently worn in the masked area ` +
  `completely with the new garment, keep realistic folds, lighting and shadows that match the photo, and keep hair and arms that occlude the garment in front of it.`;

export async function renderGarment(input: GarmentRenderInput): Promise<GarmentRenderOutput> {
  const provider = (process.env.TRYON_PROVIDER || "mock").toLowerCase();
  try {
    if (provider === "gemini") return { image: await geminiRender(input), demo: false, provider };
    if (provider === "huggingface") return { image: await huggingfaceRender(input), demo: false, provider };
    if (provider === "replicate") return { image: await replicateRender(input), demo: false, provider };
  } catch (e) {
    console.error(`[tryon] ${provider} provider failed:`, (e as Error).message);
    if (process.env.TRYON_FALLBACK_TO_MOCK !== "1") throw new Error(`AI provider (${provider}) failed: ${(e as Error).message}`);
  }
  return { image: await mockRender(input), demo: true, provider: "mock" };
}
