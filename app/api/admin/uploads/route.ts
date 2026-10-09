import { NextRequest } from "next/server";
import { json, fail, requireAdmin } from "@/lib/server";
import { enhanceProductImage, ImageError, MAX_UPLOAD_BYTES } from "@/lib/imageEnhance";

export const maxDuration = 120;

/** Stage + enhance one product image; returns original/enhanced/thumb URLs so the admin can compare and approve. */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const view = String(form?.get("view") ?? "extra");
  if (!(file instanceof File)) return fail("No file");
  if (file.size > MAX_UPLOAD_BYTES) return fail("Image is larger than 10 MB", 413);
  try {
    const r = await enhanceProductImage(Buffer.from(await file.arrayBuffer()), view);
    return json(r);
  } catch (e) {
    if (e instanceof ImageError) return fail(e.message, 415);
    console.error(e);
    return fail("Image processing failed", 500);
  }
}
