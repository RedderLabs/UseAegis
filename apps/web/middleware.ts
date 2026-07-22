import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Puerta .onion del servicio oculto (host pelado, sin esquema). Misma env var que usan
// el Footer y el resto del despliegue; es NEXT_PUBLIC_ → se hornea en build.
const WEB_ONION = process.env.NEXT_PUBLIC_WEB_ONION_URL;

/**
 * Anuncia la puerta .onion con la cabecera ESTÁNDAR `Onion-Location`, preservando la RUTA actual:
 * Tor Browser muestra el botón ".onion available" y ofrece saltar a la MISMA página en el servicio
 * oculto (no solo a la home). Same-origin: el .onion sirve la misma app Next, así que la ruta mapea
 * 1:1.
 *
 * No se anuncia cuando la petición YA llega por el propio .onion (evita el bucle; recomendación de
 * la especificación de Tor). Sustituye a la cabecera estática que antes ponía next.config.mjs.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const host = req.headers.get("host") ?? "";
  if (WEB_ONION && !host.endsWith(".onion")) {
    const { pathname, search } = req.nextUrl;
    res.headers.set("Onion-Location", `http://${WEB_ONION}${pathname}${search}`);
  }
  return res;
}

export const config = {
  // Solo páginas: excluye /api (lo sirve el relay), los assets internos de _next y los ficheros
  // con extensión (imágenes, sitemap, etc.). Así la cabecera solo viaja en respuestas de página.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
