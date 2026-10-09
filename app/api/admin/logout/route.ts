import { cookies } from "next/headers";
import { json } from "@/lib/server";
import { ADMIN_COOKIE } from "@/lib/auth";

export async function POST() {
  (await cookies()).delete(ADMIN_COOKIE);
  return json({ ok: true });
}
