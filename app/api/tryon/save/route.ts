import { NextRequest } from "next/server";
import { json, fail, getSessionId } from "@/lib/server";
import { getResult, markResultSaved, deleteSavedResult } from "@/lib/queries/tryon";

export async function POST(req: NextRequest) {
  const sid = await getSessionId();
  const body = await req.json().catch(() => null);
  const id = Number(body?.resultId);
  if (!Number.isInteger(id) || id <= 0) return fail("Nothing to save");
  const r = await getResult(id, sid);
  if (!r) return fail("Result not found", 404);
  await markResultSaved(id, sid, !!body?.share);
  return json({ ok: true, url: r.result_path });
}

export async function DELETE(req: NextRequest) {
  const sid = await getSessionId();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return fail("Bad id");
  await deleteSavedResult(id, sid);
  return json({ ok: true });
}
