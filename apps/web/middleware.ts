import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

// Puerta .onion del servicio oculto (host pelado, sin esquema). Misma env var que usan
// el Footer y el resto del despliegue; es NEXT_PUBLIC_ → se hornea en build.
const WEB_ONION = process.env.NEXT_PUBLIC_WEB_ONION_URL;

/**
 * Enrutado de idioma + anuncio de la puerta .onion.
 *
 * IDIOMA. El castellano es el idioma por defecto y se sirve SIN prefijo (`/privacidad`); el inglés
 * va prefijado (`/en/privacidad`). Internamente todo cuelga de `app/[locale]/`, así que lo no
 * prefijado se REESCRIBE a `/es/...` — reescritura, no redirección: la URL que ve el usuario (y la
 * que se indexa) sigue siendo la limpia, y ningún enlace publicado se rompe.
 *
 * NO se negocia el idioma por `Accept-Language`, a propósito y por dos razones:
 *  1. Tor Browser envía siempre `en-US,en` para que todos sus usuarios se parezcan. Autodetectar
 *     forzaría el inglés a todo el que entre por la .onion, incluidos los hispanohablantes.
 *  2. Elegir la respuesta en función de una cabecera del navegador es exactamente el tipo de señal
 *     pasiva que este proyecto evita.
 * Solo se respeta una elección EXPLÍCITA del usuario, guardada en la cookie por el selector.
 *
 * .ONION. Se anuncia con la cabecera estándar `Onion-Location` preservando la RUTA actual —
 * incluido el prefijo de idioma — para que Tor Browser ofrezca saltar a la MISMA página del
 * servicio oculto y en el MISMO idioma. No se anuncia cuando la petición ya llega por el .onion
 * (evita el bucle; recomendación de la especificación de Tor).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const first = pathname.split("/")[1] ?? "";

  // `/es/...` no es una URL canónica: el idioma por defecto va sin prefijo. Se redirige (301
  // lógico) para no acabar con la misma página indexada dos veces.
  if (first === DEFAULT_LOCALE) {
    const stripped = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    const url = req.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url);
  }

  const hasLocalePrefix = isLocale(first);

  // Elección explícita previa del usuario: si eligió inglés y aterriza en una URL sin prefijo,
  // se le lleva a su idioma. Nunca al revés a partir de cabeceras.
  if (!hasLocalePrefix) {
    const chosen = req.cookies.get(LOCALE_COOKIE)?.value;
    if (isLocale(chosen) && chosen !== DEFAULT_LOCALE) {
      const url = req.nextUrl.clone();
      url.pathname = `/${chosen}${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // Reescritura interna al segmento [locale] cuando la URL no lo lleva.
  const res = hasLocalePrefix
    ? NextResponse.next()
    : NextResponse.rewrite(
        (() => {
          const url = req.nextUrl.clone();
          url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
          return url;
        })(),
      );

  const host = req.headers.get("host") ?? "";
  if (WEB_ONION && !host.endsWith(".onion")) {
    res.headers.set("Onion-Location", `http://${WEB_ONION}${pathname}${search}`);
  }
  return res;
}

export const config = {
  // Solo páginas: excluye /api (lo sirve el relay), los assets internos de _next y los ficheros
  // con extensión (imágenes, sitemap, etc.). Así ni el idioma ni la cabecera tocan otra cosa.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
