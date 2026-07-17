import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "katex/dist/katex.min.css";
import "./globals.css";
import AppShell from "./components/AppShell";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://constantrecognizer.com";

export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Constant Recognition",
  title: {
    default: "Constant Recognition | Inverse Symbolic Calculator",
    template: "%s | Constant Recognition",
  },
  description:
    "Inverse scientific RPN calculator for testing whether numerical values can be reproduced by compact candidate formulas.",
  keywords: [
    "constant recognition",
    "inverse symbolic calculator",
    "closed form finder",
    "find formula from decimal number",
    "recognize mathematical constant",
    "PSLQ alternative",
    "RIES calculator online",
    "SymPy nsimplify alternative",
    "Wolfram Alpha constant recognition alternative",
  ],
  authors: [
    { name: "Andrzej Odrzywolek" },
    { name: "Klaudiusz Sroka" },
  ],
  creator: "Constant Recognition research project",
  publisher: "Constant Recognition",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Constant Recognition",
    title: "Constant Recognition | Inverse Symbolic Calculator",
    description:
      "A browser implementation of inverse RPN search for numerical constant recognition.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Constant Recognition inverse symbolic calculator",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Constant Recognition | Inverse Symbolic Calculator",
    description:
      "Search short RPN calculator programs that reproduce a numerical value.",
    images: ["/twitter-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "science",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-stone-50 text-slate-950`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
