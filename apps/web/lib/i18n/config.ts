/**
 * Configuración de idioma. SIN dependencias externas a propósito: dos idiomas con diccionarios
 * estáticos no justifican meter una librería de i18n (y su cadena de suministro) en un proyecto
 * con modelo de amenaza. Todo lo que hay aquí es auditable de un vistazo.
 *
 * Estrategia de rutas — `es` es el idioma por defecto y va SIN prefijo (`/privacidad`), `en` va
 * prefijado (`/en/privacidad`). Los slugs son los MISMOS en ambos idiomas: así no hace falta un
 * mapa de traducción de rutas y ningún enlace existente (README, SECURITY.md, el pie de la web)
 * se rompe. El middleware reescribe internamente lo no prefijado a `/es/...`.
 */

export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Idioma por defecto: el que se sirve sin prefijo en la URL. */
export const DEFAULT_LOCALE: Locale = "es";

/** Cookie con el idioma ELEGIDO por el usuario. Nunca se deduce de `Accept-Language` (ver middleware). */
export const LOCALE_COOKIE = "aegis.locale";

/** Un año: la elección de idioma no caduca por sesión. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Etiqueta de cada idioma en su PROPIO idioma (regla de oro de los selectores de idioma). */
export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

/** Código corto para el botón del selector. */
export const LOCALE_SHORT: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

/** Valor de `<html lang>` / `og:locale` por idioma. */
export const HTML_LANG: Record<Locale, string> = {
  es: "es",
  en: "en",
};

export const OG_LOCALE: Record<Locale, string> = {
  es: "es_ES",
  en: "en_US",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Separa el prefijo de idioma de una ruta.
 * `/en/login` → `{ locale: "en", path: "/login" }` · `/login` → `{ locale: "es", path: "/login" }`
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split("/");
  const first = segments[1];
  if (isLocale(first)) {
    const rest = "/" + segments.slice(2).join("/");
    return { locale: first, path: rest === "/" ? "/" : rest.replace(/\/$/, "") };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/**
 * Construye una ruta en el idioma dado. El idioma por defecto NO lleva prefijo.
 * `localePath("en", "/login")` → `/en/login` · `localePath("es", "/login")` → `/login`
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
