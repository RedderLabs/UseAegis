# Nodo bootstrap + relay de circuito v2 del Modo B (Fase 3). Imagen mínima, sin build nativo:
# solo WebSockets (el WebRTC lo ponen los navegadores), así que NO necesita node-datachannel.
FROM node:22-alpine

WORKDIR /app

# Instala dependencias con la lockfile propia del servicio (aislado del monorepo pnpm).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

# Corre como usuario no-root (el node:alpine trae el usuario `node`). El volumen /data (semilla
# del PeerID) se monta con permisos de ese usuario.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

EXPOSE 9001
CMD ["node", "server.mjs"]
