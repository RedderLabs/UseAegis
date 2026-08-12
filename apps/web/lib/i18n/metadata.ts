/**
 * Ayudas de SEO por idioma: `hreflang` y `canonical`.
 *
 * Cada página existe en las dos puertas de idioma (`/x` en español, `/en/x` en inglés) y ambas
 * deben declararse mutuamente con `hreflang`, o Google las trata como contenido duplicado en vez
 * de como traducciones. `x-default` apunta al idioma por defecto.
 *
 * La .onion NO entra aquí a propósito: no la rastrea ningún buscador y publicar su dirección en
 * un `canonical` la ataría a la identidad clearnet del sitio.
 */
import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALES, localePath } from "./config";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://useaegis.app";

/**
 * Bloque `alternates` para una ruta SIN prefijo de idioma (`/`, `/privacidad`, `/terminos`).
 * `canonical` es la propia URL en el idioma que se está pintando.
 */
export function alternatesFor(locale: string, path: string): Metadata["alternates"] {
  const languages = Object.fromEntries(
    LOCALES.map((l) => [l, `${SITE_URL}${localePath(l, path)}`]),
  );
  return {
    canonical: `${SITE_URL}${localePath(locale === "en" ? "en" : DEFAULT_LOCALE, path)}`,
    languages: {
      ...languages,
      "x-default": `${SITE_URL}${localePath(DEFAULT_LOCALE, path)}`,
    },
  };
}
