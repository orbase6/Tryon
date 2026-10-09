import { Glasses, Sparkles, Watch, Gem, Crown, Brush, ShoppingBag } from "lucide-react";

export function Hanger({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 7.2V6.4a2 2 0 1 1 2 2" />
      <path d="M12 7.2 2.6 14.6a1.5 1.5 0 0 0 .9 2.7h17a1.5 1.5 0 0 0 .9-2.7L12 7.2Z" />
    </svg>
  );
}

/** Hanger for clothing, brush for cosmetics, and a fitting icon per accessory region. */
export function TryOnIcon({ type, region, className = "w-5 h-5" }: { type: string; region?: string; className?: string }) {
  if (type === "garment") return <Hanger className={className} />;
  if (type === "face_makeup") return region === "lips" ? <Sparkles className={className} /> : <Brush className={className} />;
  if (region === "eyes") return <Glasses className={className} />;
  if (region === "wrist") return <Watch className={className} />;
  if (region === "ears" || region === "finger") return <Gem className={className} />;
  if (region === "head") return <Crown className={className} />;
  return <ShoppingBag className={className} />;
}
