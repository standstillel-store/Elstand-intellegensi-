import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/ai-signal",
        "/ai-performance",
        "/ai-journal",
        "/scanner",
        "/portfolio",
        "/trading",
        "/settings",
        "/paper-trader",
        "/news",
        "/whale",
        "/economic-calendar",
        "/auth",
      ],
    },
    sitemap: "https://elstand.ai/sitemap.xml",
  };
}
