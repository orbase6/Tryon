export interface LM { x: number; y: number; z?: number; v?: number }

/** Landmarks computed in the browser by MediaPipe (normalised 0..1 coordinates). */
export interface Analysis {
  width: number;
  height: number;
  pose: LM[] | null;       // 33 points
  face: LM[] | null;       // 468/478 points
  hands: { handedness: string; landmarks: LM[] }[];
}

/** Internal parsing classes (matches MediaPipe selfie_multiclass ordering). */
export const CLS = { BG: 0, HAIR: 1, SKIN: 2, FACE: 3, CLOTHES: 4, OTHER: 5 } as const;

export interface Parsing { labels: Uint8Array; width: number; height: number }

export interface Img { data: Buffer; width: number; height: number; channels: 3 | 4 } // raw pixels

export interface RenderPick {
  productId: number;
  name: string;
  tryon_type: "garment" | "face_makeup" | "accessory";
  region: string;
  subcategory: string | null;
  shade?: string;
  frontUrl: string;
  backUrl: string | null;
}

export interface Box { x0: number; y0: number; x1: number; y1: number }
