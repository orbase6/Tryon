import { StoreProvider } from "@/components/StoreProvider";
import { TryOnProvider } from "@/components/tryon/TryOnProvider";
import { TryOnPanel } from "@/components/tryon/TryOnPanel";
import { LiveTryOnHost } from "@/components/tryon/LiveTryOnHost";
import { Navbar } from "@/components/Navbar";
import { Drawers } from "@/components/Drawers";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <TryOnProvider>
        <Navbar />
        <div className="mx-auto flex max-w-[1800px] items-stretch">
          <TryOnPanel />
          <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-12">{children}</main>
        </div>
        <Drawers />
        <LiveTryOnHost />
      </TryOnProvider>
    </StoreProvider>
  );
}
