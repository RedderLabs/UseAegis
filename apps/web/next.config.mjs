/** @type {import('next').NextConfig} */

// Destino del reverse-proxy de /api en DEV (sin Caddy). Por defecto el relay local de dev.
// En el nodo NO se usa: Caddy intercepta /api antes de llegar a Next (ver infra/caddy/Caddyfile).
const RELAY_ORIGIN = process.env.RELAY_ORIGIN ?? "http://127.0.0.1:8443";

// Puerta .onion del servicio oculto. Si está definida, se anuncia con la cabecera
// estándar Onion-Location: Tor Browser mostrará el botón ".onion available" y podrá
// saltar a la sesión protegida. Google no rastrea Tor, así que esto (no el sitemap)
// es la vía correcta para "publicar" el .onion.
const WEB_ONION = process.env.NEXT_PUBLIC_WEB_ONION_URL;

const nextConfig = {
  reactStrictMode: true,
  // ui-kit y transport se distribuyen como TS del workspace sin build previo: Next los transpila.
  transpilePackages: ["@aegis/ui-kit", "@aegis/transport"],
  // Same-origin: el cliente llama a /api/* RELATIVO (sin CORS). En dev, Next reescribe /api/* →
  // el relay (RELAY_ORIGIN), quitando el prefijo /api igual que hace Caddy en el nodo.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${RELAY_ORIGIN}/:path*` }];
  },
  async headers() {
    if (!WEB_ONION) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "Onion-Location", value: `http://${WEB_ONION}` }],
      },
    ];
  },
};

export default nextConfig;
