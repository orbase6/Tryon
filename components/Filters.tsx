"use client";
import { RotateCcw, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState { minPrice: number; maxPrice: number; brands: string[]; minRating: number; onSale: boolean }
export const MAX_PRICE = 500;
export const DEFAULT_FILTERS: FilterState = { minPrice: 0, maxPrice: MAX_PRICE, brands: [], minRating: 0, onSale: false };

export function Filters({ value, onChange, brands, onReset }: { value: FilterState; onChange: (v: FilterState) => void; brands: { id: number; name: string; slug: string }[]; onReset: () => void }) {
  const set = (p: Partial<FilterState>) => onChange({ ...value, ...p });
  const active = value.minPrice > 0 || value.maxPrice < MAX_PRICE || value.brands.length > 0 || value.minRating > 0 || value.onSale;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">Price</h3>
        <div className="flex items-center gap-2 text-sm">
          <input type="number" min={0} max={value.maxPrice} value={value.minPrice} aria-label="Minimum price" onChange={(e) => set({ minPrice: Math.max(0, Math.min(Number(e.target.value) || 0, value.maxPrice)) })} className="input !px-3" />
          <span className="text-muted">–</span>
          <input type="number" min={value.minPrice} max={MAX_PRICE} value={value.maxPrice} aria-label="Maximum price" onChange={(e) => set({ maxPrice: Math.min(MAX_PRICE, Math.max(Number(e.target.value) || 0, value.minPrice)) })} className="input !px-3" />
        </div>
        <input type="range" min={0} max={MAX_PRICE} step={5} value={value.maxPrice} aria-label="Max price slider" onChange={(e) => set({ maxPrice: Math.max(Number(e.target.value), value.minPrice) })} className="mt-3 h-6 w-full" />
      </section>
      {brands.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Brand</h3>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {brands.map((b) => (
              <li key={b.id}>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-1 text-sm hover:text-brand">
                  <input type="checkbox" className="h-5 w-5 accent-brand" checked={value.brands.includes(b.slug)} onChange={(e) => set({ brands: e.target.checked ? [...value.brands, b.slug] : value.brands.filter((x) => x !== b.slug) })} />{b.name}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Rating</h3>
        <div className="flex flex-wrap gap-2">
          {[0, 3, 4, 4.5].map((r) => (
            <button key={r} onClick={() => set({ minRating: r })} className={cn("chip", value.minRating === r && "chip-on")} aria-pressed={value.minRating === r}>
              {r === 0 ? "Any" : <>{r}+ <Star className="h-3.5 w-3.5 fill-current" /></>}
            </button>
          ))}
        </div>
      </section>
      <label className="flex min-h-[44px] cursor-pointer items-center justify-between text-sm font-semibold">On sale only
        <input type="checkbox" role="switch" className="h-5 w-10 cursor-pointer appearance-none rounded-full bg-line transition checked:bg-brand relative before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition checked:before:translate-x-5" checked={value.onSale} onChange={(e) => set({ onSale: e.target.checked })} />
      </label>
      <button className="btn-ghost w-full" onClick={onReset} disabled={!active}><RotateCcw className="h-4 w-4" />Reset filters</button>
    </div>
  );
}
