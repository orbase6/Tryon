import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafe } from "@/lib/storage";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// Serves uploaded files from STORAGE_DIR. Only image extensions are served (manifests/caches are not).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params;
  const rel = segs.join("/");
  const ext = path.extname(rel).toLowerCase();
  if (!TYPES[ext] || rel.startsWith("tryon/cache/")) return new NextResponse("Not found", { status: 404 });
  const full = resolveSafe(rel);
  if (!full) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await fs.readFile(full);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[ext],
        "Cache-Control": rel.startsWith("tryon/") ? "private, max-age=3600" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
