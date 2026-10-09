import { query, queryOne, execute, parseJson } from "../db";

export interface TryOnSessionRow {
  id: string;
  session_id: string;
  user_photo_path: string;
  analysis: unknown;
  mask_path: string | null;
  created_at: string;
}

export const insertTryOnSession = (id: string, sid: string, photo: string, analysis: unknown, mask: string | null) =>
  execute("INSERT INTO tryon_sessions (id, session_id, user_photo_path, analysis, mask_path) VALUES (?,?,?,?,?)", [
    id, sid, photo, analysis ? JSON.stringify(analysis) : null, mask,
  ]);

export async function getTryOnSession(id: string, sid: string) {
  const r = await queryOne<TryOnSessionRow>("SELECT * FROM tryon_sessions WHERE id = ? AND session_id = ?", [id, sid]);
  return r ? { ...r, analysis: parseJson<unknown>(r.analysis, null) } : null;
}

export const insertResult = async (sid: string, productIds: number[], path: string) =>
  (await execute("INSERT INTO tryon_results (session_id, product_ids, result_path) VALUES (?,?,?)", [sid, JSON.stringify(productIds), path])).insertId;

export const getResult = (id: number, sid: string) =>
  queryOne<{ id: number; product_ids: unknown; result_path: string; is_saved: number }>(
    "SELECT id, product_ids, result_path, is_saved FROM tryon_results WHERE id = ? AND session_id = ?", [id, sid]);

export const markResultSaved = (id: number, sid: string, isPublic: boolean) =>
  execute("UPDATE tryon_results SET is_saved = 1, is_public = ? WHERE id = ? AND session_id = ?", [isPublic ? 1 : 0, id, sid]);

export const deleteSavedResult = (id: number, sid: string) =>
  execute("DELETE FROM tryon_results WHERE id = ? AND session_id = ? AND is_saved = 1", [id, sid]);

/** Saved results: public ones for everybody + the viewer's own. */
export async function listGalleryResults(sid: string | null) {
  const rows = await query<{ id: number; product_ids: unknown; result_path: string; created_at: string; session_id: string }>(
    `SELECT id, product_ids, result_path, created_at, session_id FROM tryon_results
     WHERE is_saved = 1 AND (is_public = 1 OR session_id = ?) ORDER BY created_at DESC LIMIT 100`,
    [sid ?? ""],
  );
  return rows.map((r) => ({ id: r.id, result_path: r.result_path, created_at: r.created_at, mine: r.session_id === sid, product_ids: parseJson<number[]>(r.product_ids, []) }));
}

/** 24h retention: returns expired, unsaved files so the caller can unlink them, and removes the rows. */
export async function purgeExpired() {
  const photos = await query<{ id: string; user_photo_path: string; mask_path: string | null }>(
    "SELECT id, user_photo_path, mask_path FROM tryon_sessions WHERE created_at < (NOW() - INTERVAL 24 HOUR)");
  const results = await query<{ id: number; result_path: string }>(
    "SELECT id, result_path FROM tryon_results WHERE is_saved = 0 AND created_at < (NOW() - INTERVAL 24 HOUR)");
  await execute("DELETE FROM tryon_sessions WHERE created_at < (NOW() - INTERVAL 24 HOUR)");
  await execute("DELETE FROM tryon_results WHERE is_saved = 0 AND created_at < (NOW() - INTERVAL 24 HOUR)");
  return { photos, results };
}
