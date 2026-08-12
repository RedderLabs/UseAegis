import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES, localePath } from "@/lib/i18n";

// Solo páginas públicas indexables. /panel (privado), /login y /register (funcionales)
// se dejan fuera a propósito. La .onion no se lista: no es rastreable por buscadores.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://useaegis.app";

const PAGES = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1 },
  { path: "/privacidad", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/terminos", changeFrequency: "monthly" as const, priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  // Cada página se lista una vez POR IDIOMA, y cada entrada declara sus traducciones con
  // `alternates.languages`: es lo que le dice a Google que `/privacidad` y `/en/privacidad` son
  // la misma página en dos idiomas y no contenido duplicado.
  return PAGES.flatMap(({ path, changeFrequency, priority }) => {
    const languages = Object.fromEntries(
      LOCALES.map((l) => [l, `${SITE_URL}${localePath(l, path)}`]),
    );
    return LOCALES.map((locale) => ({
      url: `${SITE_URL}${localePath(locale, path)}`,
      lastModified,
      changeFrequency,
      // La versión en el idioma por defecto conserva la prioridad plena; la traducida va por
      // debajo para que el buscador prefiera la canónica cuando ambas encajan igual de bien.
      priority: locale === DEFAULT_LOCALE ? priority : priority * 0.9,
      alternates: { languages },
    }));
  });
}
