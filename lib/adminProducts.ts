import { NextRequest } from "next/server";
import { enhanceProductImage, resolveStaged, ImageError, MAX_UPLOAD_BYTES } from "./imageEnhance";
import { ValidationError, type ImageSpec } from "./productInput";
import type { ProductImage } from "./types";

type Rows = { view: string; original_path: string; enhanced_path: string; thumb_path: string; sort_order: number }[];

/** Accepts application/json or multipart/form-data (`data` JSON field + front/back/side/extra files). */
export async function readProductBody(req: NextRequest): Promise<{ data: Record<string, unknown>; files: { view: ImageSpec["view"]; file: File }[] }> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(String(form.get("data") ?? "{}")); } catch { throw new ValidationError("Invalid form data"); }
    const files: { view: ImageSpec["view"]; file: File }[] = [];
    for (const view of ["front", "back", "side", "extra"] as const)
      for (const f of form.getAll(view)) if (f instanceof File && f.size > 0) files.push({ view, file: f });
    return { data, files };
  }
  return { data: (await req.json().catch(() => ({}))) as Record<string, unknown>, files: [] };
}

/**
 * Turn the submitted image list (existing ids, staged tokens, raw files) into DB rows in the order
 * front, back, side, extras — exactly the order the storefront shows.
 */
export async function buildImageRows(specs: ImageSpec[], files: { view: ImageSpec["view"]; file: File }[], categorySlug: string, existing: ProductImage[]): Promise<Rows> {
  const resolved: { view: ImageSpec["view"]; paths: { original_path: string; enhanced_path: string; thumb_path: string } }[] = [];
  const byId = new Map(existing.map((i) => [i.id, i]));
  try {
    for (const s of specs) {
      if (s.token) { const paths = await resolveStaged(s.token); resolved.push({ view: s.view, paths: s.useOriginal ? { ...paths, enhanced_path: paths.original_path } : paths }); }
      else if (s.id && byId.has(s.id)) { const e = byId.get(s.id)!; resolved.push({ view: s.view, paths: e }); }
      else throw new ValidationError("Image reference is invalid");
    }
    for (const f of files) {
      if (f.file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Image is larger than 10 MB");
      const r = await enhanceProductImage(Buffer.from(await f.file.arrayBuffer()), f.view);
      resolved.push({ view: f.view, paths: r });
    }
  } catch (e) {
    if (e instanceof ImageError) throw new ValidationError(e.message);
    throw e;
  }
  const one = (v: string) => resolved.filter((r) => r.view === v);
  if (one("front").length !== 1) throw new ValidationError("Exactly one Front image is required");
  if (categorySlug === "clothing" && one("back").length !== 1) throw new ValidationError("Back image is required for clothing");
  if (one("back").length > 1 || one("side").length > 1) throw new ValidationError("Only one Back and one Side image allowed");
  if (one("extra").length > 6) throw new ValidationError("Up to 6 extra images allowed");
  const ordered = [...one("front"), ...one("back"), ...one("side"), ...one("extra")];
  return ordered.map((r, i) => ({ view: r.view, ...r.paths, sort_order: i }));
}
