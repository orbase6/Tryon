"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import type { Product, Shade } from "@/lib/types";
import { ImageSlot, Staged } from "./ImageSlot";
import { api } from "@/lib/api";
import { slugify } from "@/lib/utils";

interface Props {
  categories: { id: number; name: string; slug: string }[];
  subcategories: { id: number; category_id: number; name: string; slug: string }[];
  brands: { id: number; name: string }[];
  product?: Product;
}

const fromImage = (i: NonNullable<Product["images"]>[number]): Staged => ({ id: i.id, original: i.original_path, enhanced: i.enhanced_path, useOriginal: i.enhanced_path === i.original_path && i.original_path.startsWith("/api/files") });

export function ProductForm({ categories, subcategories, brands, product: p }: Props) {
  const router = useRouter();
  const imgs = p?.images ?? [];
  const [name, setName] = useState(p?.name ?? "");
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!p);
  const [categoryId, setCategoryId] = useState(p?.category_id ?? categories[0]?.id ?? 0);
  const [subId, setSubId] = useState<number | "">(p?.subcategory_id ?? "");
  const [brand, setBrand] = useState(p?.brand_name ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [price, setPrice] = useState(p ? String(p.price) : "");
  const [sale, setSale] = useState(p?.sale_price ? String(p.sale_price) : "");
  const [stock, setStock] = useState(p ? String(p.stock) : "10");
  const [rating, setRating] = useState(p ? String(p.rating) : "");
  const [gender, setGender] = useState<string>(p?.gender ?? "unisex");
  const [colors, setColors] = useState((p?.colors ?? []).join(", "));
  const [sizes, setSizes] = useState((p?.sizes ?? []).join(", "));
  const [shades, setShades] = useState<Shade[]>(p?.shades ?? []);
  const [published, setPublished] = useState(p ? !!p.is_published : true);
  const [front, setFront] = useState<Staged | null>(imgs.find((i) => i.view === "front") ? fromImage(imgs.find((i) => i.view === "front")!) : null);
  const [back, setBack] = useState<Staged | null>(imgs.find((i) => i.view === "back") ? fromImage(imgs.find((i) => i.view === "back")!) : null);
  const [side, setSide] = useState<Staged | null>(imgs.find((i) => i.view === "side") ? fromImage(imgs.find((i) => i.view === "side")!) : null);
  const [extras, setExtras] = useState<(Staged | null)[]>(imgs.filter((i) => i.view === "extra").map(fromImage));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const clear = () => setErr("");

  const cat = categories.find((c) => c.id === categoryId);
  const subs = useMemo(() => subcategories.filter((s) => s.category_id === categoryId), [subcategories, categoryId]);
  const isClothing = cat?.slug === "clothing", isCosmetic = cat?.slug === "cosmetics";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!front) return setErr("Front image is required");
    if (isClothing && !back) return setErr("Back image is required for clothing");
    if (front.token === undefined && front.id === undefined) return setErr("Wait for the front image to finish processing");
    const spec = (view: string, s: Staged | null) => (s ? [{ view, id: s.id, token: s.token, useOriginal: !!s.useOriginal }] : []);
    const images = [...spec("front", front), ...(isClothing || back ? spec("back", back) : []), ...spec("side", side), ...extras.flatMap((x) => spec("extra", x))];
    if (images.some((i) => !i.id && !i.token)) return setErr("An image is still uploading");
    const body = { name, slug: slug || slugify(name), category_id: categoryId, subcategory_id: subId || null, brand_name: brand, description, price, sale_price: sale || null, stock, rating: rating || 0,
      gender, colors, sizes: isClothing ? sizes : "", shades: isCosmetic ? shades : [], is_published: published, images };
    setSaving(true);
    try {
      await api(p ? `/api/admin/products/${p.id}` : "/api/admin/products", { method: p ? "PUT" : "POST", body: JSON.stringify(body) });
      router.push("/admin/products"); router.refresh();
    } catch (e) { setErr((e as Error).message); setSaving(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => <div className={className}><label className="label">{label}</label>{children}</div>;

  return (
    <form onSubmit={submit} className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">{p ? "Edit product" : "New product"}</h1>
        {p && <Link href={`/product/${p.slug}`} target="_blank" className="text-sm text-brand underline">View on store</Link>}
        <label className="ml-auto flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold">
          <span>{published ? "Published" : "Draft"}</span>
          <input type="checkbox" role="switch" checked={published} onChange={(e) => setPublished(e.target.checked)} className="relative h-6 w-11 cursor-pointer appearance-none rounded-full bg-line transition checked:bg-brand before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition checked:before:translate-x-5" />
        </label>
      </div>
      {err && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 md:p-5">
        <Field label="Name *" className="sm:col-span-2"><input required minLength={2} maxLength={160} className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></Field>
        <Field label="Slug (URL)"><input className="input" value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }} placeholder="auto-from-name" /></Field>
        <Field label="Brand"><input list="brands" className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Nykaa" /><datalist id="brands">{brands.map((b) => <option key={b.id} value={b.name} />)}</datalist></Field>
        <Field label="Category *"><select className="input" value={categoryId} onChange={(e) => { setCategoryId(Number(e.target.value)); setSubId(""); }}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Sub-category"><select className="input" value={subId} onChange={(e) => setSubId(e.target.value ? Number(e.target.value) : "")}><option value="">— none —</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Description" className="sm:col-span-2"><textarea rows={4} maxLength={5000} className="input !py-3" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Price (USD) *"><input required type="number" min="0" step="0.01" inputMode="decimal" className="input" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Sale price"><input type="number" min="0" step="0.01" inputMode="decimal" className="input" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="leave empty if not on sale" /></Field>
        <Field label="Stock"><input type="number" min="0" step="1" inputMode="numeric" className="input" value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
        <Field label="Rating (0–5, optional)"><input type="number" min="0" max="5" step="0.1" inputMode="decimal" className="input" value={rating} onChange={(e) => setRating(e.target.value)} /></Field>
        <Field label="Gender"><select className="input" value={gender} onChange={(e) => setGender(e.target.value)}><option value="unisex">Unisex</option><option value="women">Women</option><option value="men">Men</option></select></Field>
        <Field label={isCosmetic ? "Colors (optional, comma separated)" : "Colors (comma separated)"}><input className="input" value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Black, Camel, Navy" /></Field>
        {isClothing && <Field label="Sizes (comma separated)"><input className="input" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="XS, S, M, L, XL" /></Field>}
        {isCosmetic && (
          <div className="sm:col-span-2">
            <span className="label">Shades (used as the try-on colour)</span>
            <div className="space-y-2">
              {shades.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="color" aria-label="Shade colour" value={s.hex} onChange={(e) => setShades((c) => c.map((x, k) => (k === i ? { ...x, hex: e.target.value } : x)))} className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-transparent p-1" />
                  <input className="input" placeholder="Shade name" value={s.name} onChange={(e) => setShades((c) => c.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                  <button type="button" className="icon-btn" aria-label="Remove shade" onClick={() => setShades((c) => c.filter((_, k) => k !== i))}><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" className="btn-ghost !min-h-[44px] text-xs" onClick={() => setShades((c) => [...c, { name: "", hex: "#b3122c" }])}><Plus className="h-4 w-4" />Add shade</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Images</h2>
        <p className="mb-4 text-sm text-muted">Each upload is validated, auto-rotated, sharpened/upscaled if needed and cut out from its background. Compare original and enhanced, then approve. The storefront shows these images in this order: Front → Back → Side → Details; the try-on engine uses the cutouts.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ImageSlot label="Front" required view="front" value={front} onChange={(v) => { clear(); setFront(v); }} hint="JPG/PNG/WebP · max 10 MB" />
          <ImageSlot label="Back" required={isClothing} view="back" value={back} onChange={setBack} hint={isClothing ? "Required for clothing" : "Optional"} />
          <ImageSlot label="Side" view="side" value={side} onChange={setSide} hint="Optional" />
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Extra images <span className="font-normal text-muted">({extras.length}/6)</span></h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {extras.map((x, i) => <ImageSlot key={i} compact label={`Extra ${i + 1}`} view="extra" value={x} onChange={(v) => setExtras((c) => (v ? c.map((y, k) => (k === i ? v : y)) : c.filter((_, k) => k !== i)))} />)}
          {extras.length < 6 && <ImageSlot compact label="Add extra image" view="extra" value={null} onChange={(v) => v && setExtras((c) => [...c, v])} />}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl">
        <Link href="/admin/products" className="btn-ghost">Cancel</Link>
        <button className="btn-primary ml-auto min-w-[160px]" disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />{p ? "Save changes" : "Create product"}</>}</button>
      </div>
    </form>
  );
}
