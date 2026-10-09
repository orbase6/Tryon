import type { Metadata } from "next";
import { GalleryClient } from "@/components/GalleryClient";

export const metadata: Metadata = { title: "Gallery" };
export default function GalleryPage() { return <GalleryClient />; }
