# Tor minimalista para el hidden service .onion del relay (nodo, perfil "node").
# Imagen OFICIAL de Alpine + paquete `tor` — auditable, sin entrypoints mágicos de
# terceros (evitamos dperson/torproxy, que regenera el torrc por su cuenta).
FROM alpine:3.21

RUN apk add --no-cache tor su-exec

# El arranque lo hace entrypoint.sh: fija permisos (tor:tor, 700), resuelve aegis-relay a
# su IP (Tor NO acepta nombres DNS en HiddenServicePort), reescribe el torrc y baja
# privilegios a `tor`. El torrc se monta read-only desde ./infra/tor/torrc (docker-compose.yml).
# Se invoca con `sh <script>` para no depender del bit de ejecución en el checkout.
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/bin/sh", "/usr/local/bin/entrypoint.sh"]
