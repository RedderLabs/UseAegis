/** @type {import('next').NextConfig} */

// Destino del reverse-proxy de /api en DEV (sin Caddy). Por defecto el relay local de dev.
// En el nodo NO se usa: Caddy intercepta /api antes de llegar a Next (ver infra/caddy/Caddyfile).
const RELAY_ORIGIN = process.env.RELAY_ORIGIN ?? "http://127.0.0.1:8443";

// La cabecera Onion-Location (anuncio del .onion a Tor Browser) se emite desde `middleware.ts`,
// preservando la ruta actual → Tor Browser ofrece saltar a la MISMA página del servicio oculto.
const nextConfig = {
  reactStrictMode: true,
  // Los paquetes del workspace se distribuyen como TS sin build previo: Next los transpila.
  transpilePackages: ["@aegis/ui-kit", "@aegis/transport", "@aegis/crypto-core", "@aegis/protocol"],
  // Same-origin: el cliente llama a /api/* RELATIVO (sin CORS). En dev, Next reescribe /api/* →
  // el relay (RELAY_ORIGIN), quitando el prefijo /api igual que hace Caddy en el nodo.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${RELAY_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
