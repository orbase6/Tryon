"use client";
import { motion, useDragControls, PanInfo } from "framer-motion";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTryOn } from "./TryOnProvider";

const PEEK = 76;

/** Draggable mobile bottom sheet with peek / half / full snap points (drag the handle). */
export function BottomSheet({ children }: { children: React.ReactNode }) {
  const { sheet, setSheet } = useTryOn();
  const controls = useDragControls();
  const [vh, setVh] = useState(700);
  useEffect(() => { const f = () => setVh(window.innerHeight); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const full = Math.round(vh * 0.94);
  const y = { full: 0, half: full - Math.round(vh * 0.58), peek: full - PEEK, closed: full + 40 } as const;

  const onEnd = (_: unknown, info: PanInfo) => {
    const cur = y[sheet] + info.offset.y + info.velocity.y * 0.15;
    const snaps = (["full", "half", "peek"] as const).map((k) => [k, Math.abs(y[k] - cur)] as const).sort((a, b) => a[1] - b[1]);
    if (cur > y.peek + 60) setSheet("closed"); else setSheet(snaps[0][0]);
  };

  return (
    <motion.div
      className="md:hidden fixed inset-x-0 bottom-0 z-[70] glass rounded-t-3xl shadow-[0_-20px_60px_rgba(0,0,0,.45)]"
      style={{ height: full, touchAction: "none" }}
      initial={false}
      animate={{ y: y[sheet] }}
      transition={{ type: "spring", damping: 32, stiffness: 320 }}
      drag="y" dragControls={controls} dragListener={false} dragMomentum={false}
      dragConstraints={{ top: 0, bottom: y.closed }} dragElastic={0.04}
      onDragEnd={onEnd}
      role="dialog" aria-label="Virtual try-on" aria-hidden={sheet === "closed"}
    >
      <div className="flex items-center justify-between px-4 pt-2 pb-1" onPointerDown={(e) => controls.start(e)} style={{ touchAction: "none", minHeight: PEEK - 8 }}>
        <div className="flex-1 flex flex-col items-center">
          <span className="h-1.5 w-12 rounded-full bg-line mb-2" />
          <button className="text-sm font-semibold" onClick={() => setSheet(sheet === "peek" ? "half" : sheet === "half" ? "full" : "half")} onPointerDown={(e) => e.stopPropagation()}>Virtual Try-On</button>
        </div>
        <button className="icon-btn absolute right-3 top-2" aria-label="Close try-on" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSheet("closed")}><X className="w-5 h-5" /></button>
      </div>
      <div className="overflow-y-auto overscroll-contain px-4 pb-10" style={{ height: Math.max(120, full - y[sheet === "closed" ? "peek" : sheet] - PEEK + 8 - 8), touchAction: "pan-y" }}>{children}</div>
    </motion.div>
  );
}
