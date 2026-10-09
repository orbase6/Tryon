import clsx, { ClassValue } from "clsx";

export const cn = (...a: ClassValue[]) => clsx(a);

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const effectivePrice = (p: { price: number; sale_price: number | null }) => p.sale_price ?? p.price;
export const isOnSale = (p: { price: number; sale_price: number | null }) => p.sale_price !== null && p.sale_price < p.price;
