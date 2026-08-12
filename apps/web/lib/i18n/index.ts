/**
 * Punto de entrada del i18n. Los diccionarios se importan de forma ESTÁTICA (no `await import`)
 * a propósito: son dos ficheros de texto, entran en el bundle sin coste apreciable y así funcionan
 * igual en Server Components, Client Components y en el `lib/` no-React, sin promesas de por medio
 * ni un flash de contenido sin traducir. Importa por Tor: menos idas y vueltas al servidor.
 */
import en from "./dictionaries/en";
import es from "./dictionaries/es";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import type { Dictionary } from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

/** Diccionario de un idioma. Cae al idioma por defecto si el valor no es un idioma soportado. */
export function getDictionary(locale: Locale | string | undefined): Dictionary {
  return DICTIONARIES[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

export type { Dictionary };
export {
  DEFAULT_LOCALE,
  HTML_LANG,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  LOCALE_SHORT,
  LOCALES,
  OG_LOCALE,
  isLocale,
  localePath,
  splitLocale,
  type Locale,
} from "./config";
