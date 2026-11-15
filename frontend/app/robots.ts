import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://catch-me-if-you-can-red.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/practice", "/pass-and-play", "/vault"],
        disallow: [
          "/game/",
          "/lobby/",
          "/results/",
          "/api/",
          "/_next/",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/practice", "/pass-and-play", "/vault"],
        disallow: [
          "/game/",
          "/lobby/",
          "/results/",
          "/api/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
