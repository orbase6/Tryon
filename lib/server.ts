import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { ADMIN_COOKIE, verifyAdminToken } from "./auth";

export const SID_COOKIE = "sid";

/** Guest session id (cart / wishlist / try-on). Created on first use in a route handler. */
export async function getSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SID_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  const sid = crypto.randomBytes(16).toString("hex");
  jar.set(SID_COOKIE, sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  return sid;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export async function requireAdmin(): Promise<NextResponse | null> {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export function clientIp(req: NextRequest | Request): string {
  const h = req.headers.get("x-forwarded-for");
  return (h?.split(",")[0] ?? "local").trim();
}

export function intParam(v: string | null, def: number, min = 0, max = 1_000_000) {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.floor(n))) : def;
}
