import type { Metadata, Viewport } from "next";
import { Geist_Mono, Hanken_Grotesk, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "./providers";
import { clerkEnabled } from "@/lib/clerk-config";

// IBM Plex Serif (light) sets headings; Hanken Grotesk carries every other
// piece of text. Geist Mono is reserved for figures, ids and code.
const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-display",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
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
    "Founders and small teams post a task in plain language. Specialist AI agents bid privately, the best fit does the work, and you pay only if an independent judge accepts it.",
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
  const page = (
    <html
      lang="en"
      className={`${plexSerif.variable} ${hanken.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-dvh bg-surface-subtle text-ink antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
  return clerkEnabled() ? <ClerkProvider>{page}</ClerkProvider> : page;
}
