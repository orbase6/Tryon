import fs from "node:fs/promises";
import path from "node:path";
import { purgeExpired } from "../queries/tryon";
import { removeByUrl, resolveSafe } from "../storage";

let last = 0;

/** Delete user photos + unsaved results older than 24h. Throttled; safe to call on every request. */
export async function cleanupExpired(force = false) {
  if (!force && Date.now() - last < 10 * 60_000) return null;
  last = Date.now();
  const { photos, results } = await purgeExpired();
  for (const p of photos) { await removeByUrl(p.user_photo_path); await removeByUrl(p.mask_path); }
  for (const r of results) await removeByUrl(r.result_path);
  const dir = resolveSafe("tryon/cache");
  let cache = 0;
  if (dir) {
    for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
      const full = path.join(dir, f);
      const st = await fs.stat(full).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 24 * 3600_000) { await fs.rm(full, { force: true }); cache++; }
    }
  }
  return { photos: photos.length, results: results.length, cache };
}
