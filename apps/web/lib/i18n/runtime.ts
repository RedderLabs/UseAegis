/**
 * Idioma activo para el código NO-React de `lib/` (cliente del relay, keystore, frase de
 * recuperación…). Esos módulos lanzan errores que el usuario acaba leyendo en pantalla, así que
 * también tienen que hablar su idioma, pero no pueden usar hooks.
 *
 * Es un global de módulo, y por eso SOLO se fija en el navegador: en el servidor un global se
 * compartiría entre peticiones de usuarios distintos (una petición en inglés cambiaría el idioma
 * de otra en español). En SSR `dict()` devuelve el idioma por defecto — sin efecto práctico,
 * porque todos los módulos que usan esto se ejecutan únicamente en el cliente.
 */
import { DEFAULT_LOCALE, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./index";

let active: Locale = DEFAULT_LOCALE;

/** Fija el idioma de los mensajes de `lib/`. No-op en el servidor (ver cabecera). */
export function setActiveLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  active = locale;
}

export function getActiveLocale(): Locale {
  return active;
}

/** Diccionario activo. Uso: `throw new Error(dict().errors.identityLocked)`. */
export function dict(): Dictionary {
  return getDictionary(active);
}
