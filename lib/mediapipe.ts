"use client";
// Browser-side MediaPipe loader + photo analysis (landmarks + human-parsing mask) used by the photo try-on.
import type { FaceLandmarker, HandLandmarker, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM = process.env.NEXT_PUBLIC_MP_WASM_URL || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const URLS = {
  pose: process.env.NEXT_PUBLIC_MP_POSE_URL || "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  face: process.env.NEXT_PUBLIC_MP_FACE_URL || "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
  hand: process.env.NEXT_PUBLIC_MP_HAND_URL || "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  seg: process.env.NEXT_PUBLIC_MP_SEG_URL || "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
};

type Mode = "IMAGE" | "VIDEO";
type Vision = Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>>;
let visionP: Promise<{ mod: typeof import("@mediapipe/tasks-vision"); fs: Vision }> | null = null;
const cache: Partial<Record<"pose" | "face" | "hand" | "seg", Promise<unknown>>> = {};

async function vision() {
  if (!visionP) visionP = (async () => { const mod = await import("@mediapipe/tasks-vision"); return { mod, fs: await mod.FilesetResolver.forVisionTasks(WASM) }; })();
  return visionP;
}

async function create<T>(key: keyof typeof URLS, mk: (v: Awaited<ReturnType<typeof vision>>, delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
  if (!cache[key]) {
    cache[key] = (async () => {
      const v = await vision();
      try { return await mk(v, "GPU"); } catch { return await mk(v, "CPU"); }
    })();
    (cache[key] as Promise<unknown>).catch(() => { delete cache[key]; });
  }
  return cache[key] as Promise<T>;
}

export const getPose = (mode: Mode) => create<PoseLandmarker>("pose", ({ mod, fs }, d) => mod.PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: URLS.pose, delegate: d }, runningMode: mode, numPoses: 1 })).then(async (m) => { await m.setOptions({ runningMode: mode }); return m; });
export const getFace = (mode: Mode) => create<FaceLandmarker>("face", ({ mod, fs }, d) => mod.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: URLS.face, delegate: d }, runningMode: mode, numFaces: 1 })).then(async (m) => { await m.setOptions({ runningMode: mode }); return m; });
export const getHands = (mode: Mode) => create<HandLandmarker>("hand", ({ mod, fs }, d) => mod.HandLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: URLS.hand, delegate: d }, runningMode: mode, numHands: 2 })).then(async (m) => { await m.setOptions({ runningMode: mode }); return m; });
const getSeg = () => create<ImageSegmenter>("seg", ({ mod, fs }, d) => mod.ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: URLS.seg, delegate: d }, runningMode: "IMAGE", outputCategoryMask: true, outputConfidenceMasks: false }));

export interface PhotoAnalysis {
  analysis: { width: number; height: number; pose: unknown[] | null; face: unknown[] | null; hands: { handedness: string; landmarks: unknown[] }[] };
  parsing: Blob | null;
  warnings: string[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const lm = (l: { x: number; y: number; z?: number; visibility?: number }) => ({ x: r4(l.x), y: r4(l.y), z: r4(l.z ?? 0), v: l.visibility === undefined ? 1 : r4(l.visibility) });

/** Load a user File into a ≤1024px canvas honouring EXIF orientation. */
export async function fileToCanvas(file: Blob, max = 1024): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** Detect pose / face / hands and build a human-parsing mask (class*40 in a greyscale PNG). */
export async function analyzePhoto(canvas: HTMLCanvasElement): Promise<PhotoAnalysis> {
  const warnings: string[] = [];
  const out: PhotoAnalysis["analysis"] = { width: canvas.width, height: canvas.height, pose: null, face: null, hands: [] };
  let parsing: Blob | null = null;
  const run = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.warn(`[mediapipe] ${name} failed`, e); warnings.push(name); } };

  await run("pose", async () => {
    const r = (await getPose("IMAGE")).detect(canvas);
    if (r.landmarks[0]) out.pose = r.landmarks[0].map(lm);
  });
  await run("face", async () => {
    const r = (await getFace("IMAGE")).detect(canvas);
    if (r.faceLandmarks[0]) out.face = r.faceLandmarks[0].map(lm);
  });
  await run("hands", async () => {
    const r = (await getHands("IMAGE")).detect(canvas);
    out.hands = r.landmarks.map((l, i) => ({ handedness: r.handedness[i]?.[0]?.categoryName ?? "", landmarks: l.map(lm) }));
  });
  await run("segmentation", async () => {
    const seg = await getSeg();
    const res = seg.segment(canvas);
    const mask = res.categoryMask!;
    const data = mask.getAsUint8Array();
    const c = document.createElement("canvas");
    c.width = mask.width; c.height = mask.height;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < data.length; i++) { const v = Math.min(5, data[i]) * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    parsing = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    mask.close();
  });
  return { analysis: out, parsing, warnings };
}
