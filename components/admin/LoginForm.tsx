"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) }); router.replace(next && next.startsWith("/admin") ? next : "/admin/products"); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-4 rounded-3xl p-6 shadow-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-black"><Lock className="h-6 w-6" /></div>
        <div><h1 className="text-xl font-bold">Admin sign in</h1><p className="text-sm text-muted">Enter the admin password from your .env file.</p></div>
        <div><label htmlFor="pw" className="label">Password</label><input id="pw" type="password" autoFocus autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} className="input" /></div>
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !pw}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
