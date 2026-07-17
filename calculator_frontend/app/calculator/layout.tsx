import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Calculator App",
  description:
    "Run the Constant Recognition inverse symbolic calculator as a focused browser application with local WebAssembly workers and experimental WebGPU support.",
  alternates: {
    canonical: "/calculator",
  },
};

export default function CalculatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
