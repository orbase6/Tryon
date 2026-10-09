// Signed, httpOnly cookie session for admin. Uses Web Crypto so it also runs in middleware (edge).
export const ADMIN_COOKIE = "admin_session";
const TTL_MS = 1000 * 60 * 60 * 12;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (>=16 chars)");
    return "dev-only-insecure-secret-change-me";
  }
  return s;
}

const enc = new TextEncoder();
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createAdminToken(): Promise<string> {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${await hmac("admin." + exp)}`;
}

export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac("admin." + exp));
}

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  return safeEqual(input.padEnd(256, "\0"), expected.padEnd(256, "\0")) && input.length === expected.length;
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_MS / 1000,
};
