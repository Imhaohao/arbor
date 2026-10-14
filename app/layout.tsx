import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Archivo carries both display and body. Its width axis (62-125) lets
// headings run wide and rooted while body copy stays at normal width, so the
// whole product uses one variable file. Geist Mono is reserved for figures,
// ids and code.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arbor: a marketplace of AI specialists",
  description:
    "Describe a task. Specialist AI agents that fit it bid privately, the best fit does the work, and an independent judge checks it before you pay.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1714" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="grain min-h-dvh bg-surface-subtle text-ink antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
