"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, Search, Trash2 } from "lucide-react";
import type { Product } from "@/lib/types";
import { api } from "@/lib/api";
import { cn, money } from "@/lib/utils";

export function AdminProducts({ categories }: { categories: { id: number; name: string; slug: string }[] }) {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (dq) p.set("q", dq); if (cat) p.set("category", cat); if (status) p.set("published", status);
      const r = await api<{ items: Product[]; total: number; pages: number }>(`/api/admin/products?${p}`);
      setItems(r.items); setTotal(r.total); setPages(Math.max(1, r.pages));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [page, dq, cat, status]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p: Product) => {
    const next = !p.is_published;
    setItems((c) => c.map((x) => (x.id === p.id ? { ...x, is_published: next ? 1 : 0 } : x)));
    try { await api(`/api/admin/products/${p.id}/publish`, { method: "PATCH", body: JSON.stringify({ published: next }) }); } catch (e) { setErr((e as Error).message); load(); }
  };
  const del = async (p: Product) => {
    if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    try { await api(`/api/admin/products/${p.id}`, { method: "DELETE" }); load(); } catch (e) { setErr((e as Error).message); }
  };

  const Thumb = ({ p }: { p: Product }) => (
    <span className="checker relative block h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line">{p.cover_thumb && <Image src={p.cover_thumb} alt="" fill sizes="56px" className="object-contain" unoptimized />}</span>
  );
  const Status = ({ p }: { p: Product }) => <span className={cn("inline-block self-start shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", p.is_published ? "bg-emerald-500/15 text-emerald-400" : "bg-line text-muted")}>{p.is_published ? "Published" : "Draft"}</span>;
  const Actions = ({ p }: { p: Product }) => (
    <div className="flex items-center justify-end gap-1.5">
      <button className="icon-btn" aria-label={p.is_published ? "Unpublish" : "Publish"} title={p.is_published ? "Unpublish" : "Publish"} onClick={() => toggle(p)}>{p.is_published ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}</button>
      <Link className="icon-btn" aria-label="Edit" href={`/admin/products/${p.id}/edit`}><Pencil className="h-5 w-5" /></Link>
      <button className="icon-btn hover:!text-red-400" aria-label="Delete" onClick={() => del(p)}><Trash2 className="h-5 w-5" /></button>
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold">Products</h1><p className="text-sm text-muted">{total} total</p></div></div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand…" aria-label="Search products" className="input pl-10" /></div>
        <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} className="input sm:w-44" aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input sm:w-40" aria-label="Status"><option value="">Any status</option><option value="1">Published</option><option value="0">Draft</option></select>
      </div>
      {err && <p role="alert" className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

      {/* table on md+ */}
      <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-muted"><tr><th className="p-3">Product</th><th>Category</th><th>Brand</th><th>Price</th><th>Stock</th><th>Status</th><th className="pr-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {loading && Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={7} className="p-3"><div className="skeleton h-14 w-full" /></td></tr>)}
            {!loading && items.map((p) => (
              <tr key={p.id} className="hover:bg-card/60">
                <td className="p-3"><div className="flex items-center gap-3"><Thumb p={p} /><div className="min-w-0"><Link href={`/product/${p.slug}`} target="_blank" className="block max-w-[260px] truncate font-semibold hover:text-brand">{p.name}</Link><span className="text-xs text-muted">/{p.slug}</span></div></div></td>
                <td>{p.category_name}{p.subcategory_name && <span className="text-muted"> · {p.subcategory_name}</span>}</td>
                <td>{p.brand_name ?? "—"}</td>
                <td>{p.sale_price ? <><b>{money(p.sale_price)}</b> <s className="text-muted">{money(p.price)}</s></> : <b>{money(p.price)}</b>}</td>
                <td className={cn(p.stock < 5 && "text-red-400")}>{p.stock}</td>
                <td><Status p={p} /></td>
                <td className="pr-3"><Actions p={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* cards on mobile */}
      <div className="space-y-3 md:hidden">
        {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 w-full" />)}
        {!loading && items.map((p) => (
          <div key={p.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex gap-3"><Thumb p={p} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="truncate text-xs text-muted">{p.category_name} · {p.brand_name ?? "No brand"}</p><p className="mt-1 text-sm">{p.sale_price ? <><b>{money(p.sale_price)}</b> <s className="text-muted">{money(p.price)}</s></> : <b>{money(p.price)}</b>} <span className="text-muted">· stock {p.stock}</span></p></div><Status p={p} /></div>
            <div className="mt-2"><Actions p={p} /></div>
          </div>
        ))}
      </div>
      {!loading && items.length === 0 && <p className="py-16 text-center text-muted">No products found.</p>}
      <div className="mt-5 flex items-center justify-center gap-3">
        <button className="icon-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-sm text-muted">Page {page} of {pages}</span>
        <button className="icon-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
