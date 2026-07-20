#!/bin/sh
# Entrypoint del contenedor Tor en el NODO DEDICADO (Tiny), topología LAN.
#
# Diferencia con entrypoint.coolify.sh: allí Tor y la app comparten host y se resuelven nombres de
# servicio Docker a IP. Aquí la app está en OTRA máquina (Coolify VM) y su IP llega por env
# COOLIFY_HOST — no hay DNS que resolver, solo sustituir el marcador del torrc.
set -eu

# 1. Permisos que Tor EXIGE en el DataDirectory / HiddenServiceDir: dueño `tor`, modo 700.
#    (También arregla los permisos de las claves migradas de la Coolify VM.)
mkdir -p /var/lib/tor/aegis-relay /var/lib/tor/aegis-web
chown -R tor:tor /var/lib/tor
chmod 700 /var/lib/tor /var/lib/tor/aegis-relay /var/lib/tor/aegis-web

# 2. IP LAN de la Coolify VM (donde corren web:3000 y relay:8443). Obligatoria.
: "${COOLIFY_HOST:?COOLIFY_HOST no definido: IP LAN de la Coolify VM, p.ej. 192.168.8.102}"
echo "aegis-tor(node): onion -> ${COOLIFY_HOST} (web:3000 / relay:8443)"

# 3. Sustituir el marcador por la IP y reescribir el torrc (el original va horneado read-only).
sed -e "s/__COOLIFY_HOST__/${COOLIFY_HOST}/g" \
	/etc/tor/torrc > /tmp/torrc.runtime
chown tor:tor /tmp/torrc.runtime

# 4. Bajar privilegios y arrancar Tor como usuario `tor` (no como root).
exec su-exec tor tor -f /tmp/torrc.runtime
