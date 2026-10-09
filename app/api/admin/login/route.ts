import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { json, fail, clientIp } from "@/lib/server";
import { ADMIN_COOKIE, adminCookieOptions, checkAdminPassword, createAdminToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const rl = rateLimit(`login:${clientIp(req)}`, 8, 10 * 60_000);
  if (!rl.ok) return fail(`Too many attempts. Try again in ${rl.retryAfter}s`, 429);
  const body = await req.json().catch(() => ({}));
  if (typeof body.password !== "string" || !checkAdminPassword(body.password)) return fail("Wrong password", 401);
  (await cookies()).set(ADMIN_COOKIE, await createAdminToken(), adminCookieOptions);
  return json({ ok: true });
}
