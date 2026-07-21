import type { MetadataRoute } from "next";

// URL pública clearnet (la única indexable por buscadores). La .onion NO va aquí:
// Google/Bing no rastrean la red Tor. Se anuncia vía cabecera Onion-Location
// (next.config.mjs) y visible en la propia web.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://useaegis.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Zona autenticada y API: fuera del índice.
      disallow: ["/panel", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
