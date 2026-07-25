# Imagen de la WEB (Next.js) para el nodo ("todo en Docker"). Build compilado + `next start`
# 24/7 con restart automático. Espejo de apps/relay/Dockerfile.
#
# Context = RAÍZ del repo (necesita el workspace pnpm completo: pnpm-lock.yaml + los package.json
# de cada paquete) para un install reproducible con --frozen-lockfile. El .dockerignore recorta
# node_modules/.git/.next para un contexto ligero. Solo se instala el subgrafo de la web
# (--filter @aegis/web...), que incluye @aegis/ui-kit.
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY . .

# Instala SOLO las deps de la web con el lockfile congelado. Incluye devDeps a propósito
# (tailwind/postcss/typescript para el build); NODE_ENV se fija a production más abajo.
RUN pnpm install --frozen-lockfile --filter @aegis/web...

# Las NEXT_PUBLIC_* se INCRUSTAN en el bundle en build-time → llegan como build args (compose).
# El cliente habla con el relay como /api RELATIVO (mismo origen), así que NO hace falta la URL
# del relay aquí. Solo pasamos la URL de la "otra puerta" para el enlace informativo: desde la
# web clearnet mostramos la .onion de la web (y viceversa por window.location).
ARG NEXT_PUBLIC_WEB_ONION_URL=""
ENV NEXT_PUBLIC_WEB_ONION_URL=$NEXT_PUBLIC_WEB_ONION_URL
# RELAY_ORIGIN debe existir en BUILD-TIME: Next.js congela los rewrites de /api en el build
# (routes-manifest), no en runtime. En el nodo (con Caddy) el rewrite no se usa; pero en Coolify
# (sin Caddy) ES el proxy /api→relay, así que hay que hornear el destino real (relay:8443).
# Default = el mismo fallback de next.config → no cambia el comportamiento del nodo/dev.
ARG RELAY_ORIGIN="http://127.0.0.1:8443"
ENV RELAY_ORIGIN=$RELAY_ORIGIN
# Umami (analítica SOLO de la landing) — NEXT_PUBLIC_* → se incrustan en build-time. Vacías =
# el componente UmamiAnalytics devuelve null (sin script, cero red). Se rellenan por build-arg.
ARG NEXT_PUBLIC_UMAMI_SRC=""
ENV NEXT_PUBLIC_UMAMI_SRC=$NEXT_PUBLIC_UMAMI_SRC
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
# Modo B (libp2p, Fase 3) — multiaddr(s) del/los nodo(s) bootstrap, coma-separados. NEXT_PUBLIC_* →
# se incrusta en build-time. VACÍO = el candidato P2P NO se añade al failover y el chat queda solo
# relay (idéntico a hoy). Con valor, el chat añade P2P como 2.º candidato. Formato en prod:
#   /dns4/p2p.useaegis.app/tcp/443/wss/p2p/<PeerID>   (el PeerID lo imprime el bootstrap al arrancar)
ARG NEXT_PUBLIC_P2P_BOOTSTRAP=""
ENV NEXT_PUBLIC_P2P_BOOTSTRAP=$NEXT_PUBLIC_P2P_BOOTSTRAP
# Modo B por la puerta .onion (Tor): multiaddr(s) del circuit-relay servido en la onion (WS plano,
# Tor cifra). VACÍO = sobre Tor el chat queda solo relay. Formato:
#   /dns4/<web-onion>.onion/tcp/9001/ws/p2p/<PeerID>
ARG NEXT_PUBLIC_P2P_BOOTSTRAP_ONION=""
ENV NEXT_PUBLIC_P2P_BOOTSTRAP_ONION=$NEXT_PUBLIC_P2P_BOOTSTRAP_ONION
RUN pnpm --filter @aegis/web build

WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
# `next start` bindea 0.0.0.0:3000 por defecto → alcanzable por Caddy/Tor en la red de compose.
CMD ["pnpm", "start"]
