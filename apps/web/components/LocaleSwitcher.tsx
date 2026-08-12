"use client";

/**
 * Selector de idioma ES/EN.
 *
 * Son ENLACES REALES, no botones con `onClick`. En el Navegador Tor al nivel «Safest» el
 * JavaScript está desactivado: un selector basado en JS dejaría a esos usuarios —justo los que
 * entran por la .onion— sin forma de cambiar de idioma. Con enlaces, el cambio lo hace el
 * servidor a partir del prefijo de la URL y funciona con JS apagado.
 *
 * La cookie es solo una comodidad ENCIMA de eso: se escribe al hacer clic (si hay JS) para
 * recordar la elección en la próxima visita a una URL sin prefijo. Si no hay JS, no hay cookie y
 * no pasa nada: el idioma sigue viviendo en la URL.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  LOCALE_SHORT,
  localePath,
  splitLocale,
  type Locale,
} from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/provider";

/** Recuerda la elección para la próxima visita. `SameSite=Lax`: no viaja en peticiones de terceros. */
function remember(locale: Locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    /* sin cookies (o bloqueadas): el idioma sigue en la URL, que es lo que manda */
  }
}

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const current = useLocale();
  const t = useT();
  const pathname = usePathname() ?? "/";
  // `usePathname` devuelve la ruta PÚBLICA (con el prefijo /en si lo hay); se quita para poder
  // reconstruirla en el otro idioma y aterrizar en la MISMA página, no en la portada.
  const { path } = splitLocale(pathname);

  return (
    <div
      className={`inline-flex items-center rounded-sm border border-line overflow-hidden ${className}`}
      role="group"
      aria-label={t.common.switchLanguage}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={localePath(locale, path)}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            title={LOCALE_LABELS[locale]}
            onClick={() => remember(locale)}
            className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              active
                ? "bg-accent/10 text-accent"
                : "text-muted-2 hover:text-text hover:bg-surface-2"
            }`}
          >
            {LOCALE_SHORT[locale]}
            <span className="sr-only"> — {LOCALE_LABELS[locale]}</span>
          </Link>
        );
      })}
    </div>
  );
}
