"use client";
import dynamic from "next/dynamic";
import { useTryOn } from "./TryOnProvider";

const LiveTryOn = dynamic(() => import("./LiveTryOn").then((m) => m.LiveTryOn), { ssr: false });

export function LiveTryOnHost() {
  const { live } = useTryOn();
  return live ? <LiveTryOn /> : null;
}
