import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH
  ? `/${process.env.NEXT_PUBLIC_BASE_PATH.replace(/^\/+|\/+$/g, "")}`
  : "";

const withBasePath = (path: string) => `${basePath}${path}`;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Constant Recognition",
    short_name: "ConstantRec",
    description:
      "Browser-based inverse symbolic calculator for recognizing numerical constants.",
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#0f172a",
    icons: [
      {
        src: withBasePath("/favicon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
