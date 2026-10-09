import Link from "next/link";
export default function NotFound() {
  return <div className="grid place-items-center gap-4 py-28 text-center"><h1 className="text-2xl font-bold">Product not found</h1><Link href="/shop" className="btn-primary">Back to shop</Link></div>;
}
