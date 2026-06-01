import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://constantrecognition.app").replace(/\/+$/, "");

const routes = ["/", "/calculator", "/examples", "/compare", "/docs", "/blog"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${siteUrl}${route === "/" ? "" : route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/calculator" ? 0.9 : 0.7,
  }));
}
