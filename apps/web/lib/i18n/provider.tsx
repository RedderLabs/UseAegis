"use client";

/**
 * Contexto de idioma para los Client Components.
 *
 * `useT()` devuelve el DICCIONARIO en sí, no una función `t("clave.anidada")`. Así el acceso es
 * `t.channel.sent` y TypeScript comprueba cada cadena en compilación: no existe la clase de fallo
 * "clave que no existe y sale el literal en pantalla". Las cadenas con datos dentro son funciones
 * tipadas (`t.channel.pendingRequests(3)`).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, localePath, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./index";
import { setActiveLocale } from "./runtime";

interface LocaleContextValue {
  locale: Locale;
  t: Dictionary;
}

const LocaleCtx = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: getDictionary(DEFAULT_LOCALE),
});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Propaga el idioma al `lib/` no-React (mensajes de error del relay, keystore, etc.) ANTES de
  // pintar los hijos, para que un error lanzado en el primer render ya salga traducido. En el
  // servidor es un no-op deliberado (ver runtime.ts).
  setActiveLocale(locale);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: getDictionary(locale) }),
    [locale],
  );
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

/** Idioma activo de la UI. */
export function useLocale(): Locale {
  return useContext(LocaleCtx).locale;
}

/** Diccionario del idioma activo. */
export function useT(): Dictionary {
  return useContext(LocaleCtx).t;
}

/**
 * Construye rutas internas en el idioma activo: `href("/login")` → `/login` en es, `/en/login` en
 * en. Todos los enlaces de la app pasan por aquí para que navegar no te devuelva al castellano.
 */
export function useLocalePath(): (path: string) => string {
  const locale = useLocale();
  return useMemo(() => (path: string) => localePath(locale, path), [locale]);
}
