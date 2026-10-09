"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X, SearchX } from "lucide-react";
import type { Product } from "@/lib/types";
import { ProductCard, CardSkeleton } from "./ProductCard";
import { Filters, DEFAULT_FILTERS, FilterState, MAX_PRICE } from "./Filters";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Props {
  categories: { id: number; name: string; slug: string }[];
  subcategories: { id: number; category_id: number; name: string; slug: string }[];
  brands: { id: number; name: string; slug: string; }[];
  initial: { items: Product[]; total: number; params: { category: string; sub: string; q: string; sort: string } };
}
const PAGE = 12;
const SORTS = [["newest", "Newest"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["rating", "Top rated"]] as const;

export function ShopClient({ categories, subcategories, brands: allBrands, initial }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState(initial.params.category);
  const [sub, setSub] = useState(initial.params.sub);
  const [sort, setSort] = useState(initial.params.sort);
  const q = initial.params.q;
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [items, setItems] = useState<Product[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [brandList, setBrandList] = useState(allBrands);
  const first = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const qs = useCallback((pg: number) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (sub) p.set("sub", sub);
    if (q) p.set("q", q);
    p.set("sort", sort);
    if (filters.minPrice > 0) p.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice < MAX_PRICE) p.set("maxPrice", String(filters.maxPrice));
    if (filters.brands.length) p.set("brands", filters.brands.join(","));
    if (filters.minRating) p.set("minRating", String(filters.minRating));
    if (filters.onSale) p.set("onSale", "1");
    p.set("page", String(pg)); p.set("pageSize", String(PAGE));
    return p.toString();
  }, [category, sub, q, sort, filters]);

  const load = useCallback(async (pg: number, replace: boolean) => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const r = await api<{ items: Product[]; total: number }>(`/api/products?${qs(pg)}`);
      if (id !== reqId.current) return;
      setItems((cur) => (replace ? r.items : [...cur, ...r.items])); setTotal(r.total); setPage(pg);
    } catch (e) { if (id === reqId.current) setError((e as Error).message); }
    finally { if (id === reqId.current) setLoading(false); }
  }, [qs]);

  useEffect(() => { // refetch when filters change (initial data came from the server)
    if (first.current) { first.current = false; return; }
    load(1, true);
    const u = new URLSearchParams(); if (category) u.set("category", category); if (sub) u.set("sub", sub); if (q) u.set("q", q); if (sort !== "newest") u.set("sort", sort);
    router.replace(`/shop${u.size ? "?" + u : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sub, sort, filters]);

  useEffect(() => { // brand facet follows the category
    api<{ brands: typeof allBrands }>(`/api/brands${category ? `?category=${category}` : ""}`).then((r) => { setBrandList(r.brands); setFilters((f) => ({ ...f, brands: f.brands.filter((b) => r.brands.some((x) => x.slug === b)) })); }).catch(() => {});
  }, [category]);

  const hasMore = items.length < total;
  useEffect(() => { // infinite scroll
    const el = sentinel.current; if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) load(page + 1, false); }, { rootMargin: "400px" });
    io.observe(el); return () => io.disconnect();
  }, [hasMore, loading, page, load]);

  const catId = categories.find((c) => c.slug === category)?.id;
  const subs = subcategories.filter((s) => s.category_id === catId);
  const reset = () => setFilters(DEFAULT_FILTERS);
  const pickCat = (slug: string) => { setCategory(slug); setSub(""); };

  const filterPanel = <Filters value={filters} onChange={setFilters} brands={brandList} onReset={reset} />;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{q ? <>Results for “{q}”</> : "Shop the collection"}</h1>
        <p className="mt-1 text-sm text-muted">Tap the hanger on any product to wear it in the try-on panel.</p>
      </div>

      <div role="tablist" aria-label="Categories" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {[{ slug: "", name: "All" }, ...categories].map((c) => (
          <button key={c.slug} role="tab" aria-selected={category === c.slug} onClick={() => pickCat(c.slug)} className={cn("chip !min-h-[44px] !px-5 font-medium", category === c.slug && "chip-on")}>{c.name}</button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {category === "accessories" && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" aria-label="Accessory type">
              <button onClick={() => setSub("")} className={cn("chip !min-h-[40px] text-xs", !sub && "chip-on")}>All accessories</button>
              {subs.map((s) => <button key={s.id} onClick={() => setSub(s.slug)} className={cn("chip !min-h-[40px] text-xs", sub === s.slug && "chip-on")}>{s.name}</button>)}
            </div>
          </motion.div>
        )}
        {category && category !== "accessories" && subs.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              <button onClick={() => setSub("")} className={cn("chip !min-h-[40px] text-xs", !sub && "chip-on")}>All</button>
              {subs.map((s) => <button key={s.id} onClick={() => setSub(s.slug)} className={cn("chip !min-h-[40px] text-xs", sub === s.slug && "chip-on")}>{s.name}</button>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">{total} product{total === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          <button className="btn-ghost xl:!hidden" onClick={() => setSheet(true)}><SlidersHorizontal className="h-4 w-4" />Filters</button>
          <label className="sr-only" htmlFor="sort">Sort</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="input !w-auto !rounded-full pr-8">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex gap-6">
        <aside className="hidden w-60 shrink-0 xl:block" aria-label="Filters"><div className="sticky top-[84px] rounded-xl2 border border-line bg-card p-4">{filterPanel}</div></aside>
        <div className="min-w-0 flex-1">
          {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error} <button className="underline" onClick={() => load(1, true)}>Retry</button></p>}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {items.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
            {loading && Array.from({ length: items.length ? 4 : 8 }).map((_, i) => <CardSkeleton key={`s${i}`} />)}
          </div>
          {!loading && items.length === 0 && !error && (
            <div className="grid place-items-center gap-3 py-24 text-center"><SearchX className="h-10 w-10 text-muted" /><p className="font-semibold">No products match your filters</p><button className="btn-primary" onClick={() => { reset(); setSub(""); }}>Reset filters</button></div>
          )}
          <div ref={sentinel} className="h-8" />
          {hasMore && !loading && <div className="text-center"><button className="btn-ghost" onClick={() => load(page + 1, false)}>Load more</button></div>}
        </div>
      </div>

      <AnimatePresence>
        {sheet && (
          <>
            <motion.div className="fixed inset-0 z-[80] bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            <motion.div role="dialog" aria-label="Filters" className="fixed inset-x-0 bottom-0 z-[81] max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5 pb-8"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}>
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Filters</h2><button className="icon-btn" aria-label="Close filters" onClick={() => setSheet(false)}><X className="h-5 w-5" /></button></div>
              {filterPanel}
              <button className="btn-primary mt-5 w-full" onClick={() => setSheet(false)}>Show {total} result{total === 1 ? "" : "s"}</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
