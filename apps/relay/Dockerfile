# Imagen del relay de Aegis para el nodo ("todo en Docker"). Build COMPILADO (tsc → dist) y
# arranque con `node` (no tsx), pensado para correr 24/7 con restart automático.
#
# Se construye desde la RAÍZ del repo (context: .) porque necesita el workspace pnpm completo
# (pnpm-lock.yaml + los package.json de cada paquete) para un install reproducible con
# --frozen-lockfile. El .dockerignore recorta node_modules/.git/dist para que el contexto sea
# ligero. Solo se instala el subgrafo del relay (--filter @aegis/relay...), no la web.
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

# Todo el repo (el .dockerignore ya quita lo pesado/regenerable y los .env con secretos).
COPY . .

# Instala SOLO las deps del relay con el lockfile congelado. Incluye devDeps a propósito
# (node-pg-migrate para migrar y typescript para compilar); NODE_ENV se fija a production
# más abajo, ya después del install, para no perder esas devDeps.
RUN pnpm install --frozen-lockfile --filter @aegis/relay...

# Compila TypeScript → apps/relay/dist/.
RUN pnpm --filter @aegis/relay build

WORKDIR /app/apps/relay
ENV NODE_ENV=production
EXPOSE 8443

# Arranque: aplica migraciones pendientes (idempotente, lee DATABASE_URL del entorno) y luego
# levanta el relay compilado. Si no hay migraciones nuevas, node-pg-migrate sale 0 y sigue.
CMD ["sh", "-c", "node_modules/.bin/node-pg-migrate up && node dist/index.js"]
