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
RUN pnpm --filter @aegis/web build

WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
# `next start` bindea 0.0.0.0:3000 por defecto → alcanzable por Caddy/Tor en la red de compose.
CMD ["pnpm", "start"]
