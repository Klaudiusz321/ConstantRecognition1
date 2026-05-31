import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "katex/dist/katex.min.css";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

export const metadata: Metadata = {
  title: "Constant Recognition | Inverse Symbolic Calculator",
  description: "Identify numerical constants and find closed-form formulas from decimal numbers using exhaustive brute-force search. A fast, open-source alternative to RIES, PSLQ, and Wolfram Alpha.",
  keywords: [
    "find formula from decimal number",
    "recognize mathematical constant",
    "inverse symbolic calculator",
    "closed form finder",
    "identify numerical constant",
    "find closed form from numerical value",
    "PSLQ calculator alternative",
    "RIES calculator online",
    "Wolfram Alpha constant recognition alternative"
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-[#0a0a0b] text-white min-h-screen flex flex-col`}
      >
        <Navbar />
        <main className="flex-1 pt-16">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
