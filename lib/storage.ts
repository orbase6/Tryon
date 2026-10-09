import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));
/** Public URL prefix for files in STORAGE_ROOT (served by /api/files/[...path]). */
export const FILE_URL_PREFIX = "/api/files/";

export const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString("hex");

export function resolveSafe(rel: string): string | null {
  const full = path.resolve(STORAGE_ROOT, rel);
  return full.startsWith(STORAGE_ROOT + path.sep) ? full : null;
}

export async function saveFile(rel: string, data: Buffer): Promise<string> {
  const full = resolveSafe(rel);
  if (!full) throw new Error("Invalid path");
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return FILE_URL_PREFIX + rel;
}

/** Read a file by its public URL ("/api/files/..." or a static "/seed/..." path from /public). */
export async function readByUrl(url: string): Promise<Buffer> {
  if (url.startsWith(FILE_URL_PREFIX)) {
    const full = resolveSafe(url.slice(FILE_URL_PREFIX.length));
    if (!full) throw new Error("Invalid path");
    return fs.readFile(full);
  }
  const pub = path.resolve(process.cwd(), "public");
  const full = path.resolve(pub, "." + url);
  if (!full.startsWith(pub + path.sep)) throw new Error("Invalid path");
  return fs.readFile(full);
}

export async function removeByUrl(url: string | null | undefined) {
  if (!url || !url.startsWith(FILE_URL_PREFIX)) return; // never delete seed assets
  const full = resolveSafe(url.slice(FILE_URL_PREFIX.length));
  if (full) await fs.rm(full, { force: true });
}
