# Tor minimalista para el hidden service .onion del relay (nodo, perfil "node").
# Imagen OFICIAL de Alpine + paquete `tor` — auditable, sin entrypoints mágicos de
# terceros (evitamos dperson/torproxy, que regenera el torrc por su cuenta).
FROM alpine:3.21

RUN apk add --no-cache tor su-exec

# Arranque (sin script aparte para no depender de bits de ejecución ni CRLF en Windows):
#   1. Crea el HiddenServiceDir dentro del volumen persistido (/var/lib/tor).
#   2. Lo pone en propiedad del usuario `tor` con permisos 700 —que Tor EXIGE— tanto en
#      el DataDirectory como en el HiddenServiceDir.
#   3. Baja privilegios con su-exec y corre Tor como `tor` (no como root).
# El torrc se monta read-only desde ./infra/tor/torrc (ver docker-compose.yml).
ENTRYPOINT ["/bin/sh", "-c", "mkdir -p /var/lib/tor/aegis-relay && chown -R tor:tor /var/lib/tor && chmod 700 /var/lib/tor /var/lib/tor/aegis-relay && exec su-exec tor tor -f /etc/tor/torrc"]
