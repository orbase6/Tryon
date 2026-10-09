import { NextRequest } from "next/server";
import { json, fail } from "@/lib/server";
import { cleanupExpired } from "@/lib/tryon/cleanup";

// Cron entry point: curl -X POST -H "x-cron-secret: $CRON_SECRET" https://host/api/cleanup
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return fail("Forbidden", 403);
  return json(await cleanupExpired(true));
}
