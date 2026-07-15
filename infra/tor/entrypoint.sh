#!/bin/sh
# Entrypoint del contenedor Tor del nodo.
#
# Tor NO resuelve nombres DNS en HiddenServicePort: exige una IP literal (por eso el
# `tor` nativo usaba 127.0.0.1). El nombre de servicio de compose `aegis-relay` no vale
# directamente en el torrc. Aquí lo resolvemos a su IP actual en la red de Docker (getent)
# y arrancamos Tor con una copia del torrc ya reescrita — así el torrc del repo se mantiene
# legible con el nombre de servicio y portable (VPS incluido).
set -eu

# 1. Permisos que Tor EXIGE en el DataDirectory / HiddenServiceDir: dueño `tor`, modo 700.
mkdir -p /var/lib/tor/aegis-relay
chown -R tor:tor /var/lib/tor
chmod 700 /var/lib/tor /var/lib/tor/aegis-relay

# 2. Resolver aegis-relay -> IP, con reintentos por si el DNS de compose aún no está listo.
RELAY_IP=""
i=0
while [ "$i" -lt 30 ]; do
	RELAY_IP=$(getent hosts aegis-relay | awk '{ print $1; exit }')
	[ -n "$RELAY_IP" ] && break
	echo "aegis-tor: esperando a que resuelva aegis-relay... ($i)"
	i=$((i + 1))
	sleep 1
done
if [ -z "$RELAY_IP" ]; then
	echo "aegis-tor: ERROR - no se pudo resolver aegis-relay en la red de Docker" >&2
	exit 1
fi
echo "aegis-tor: aegis-relay -> $RELAY_IP"

# 3. Reescribir el torrc con la IP resuelta (el original se monta read-only).
sed "s/aegis-relay:8443/${RELAY_IP}:8443/g" /etc/tor/torrc > /tmp/torrc.runtime
chown tor:tor /tmp/torrc.runtime

# 4. Bajar privilegios y arrancar Tor como usuario `tor` (no como root).
exec su-exec tor tor -f /tmp/torrc.runtime
