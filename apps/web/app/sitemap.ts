import type { MetadataRoute } from "next";

// Solo páginas públicas indexables. /panel (privado), /login y /register (funcionales)
// se dejan fuera a propósito. La .onion no se lista: no es rastreable por buscadores.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://useaegis.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacidad`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terminos`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
