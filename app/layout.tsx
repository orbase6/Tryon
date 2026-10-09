import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Atelier — Fashion, Beauty & Accessories with Virtual Try-On", template: "%s · Atelier" },
  description: "Shop fashion, cosmetics and accessories and try them on yourself with the AI virtual try-on panel.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a0d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
