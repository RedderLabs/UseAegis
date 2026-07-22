#!/bin/sh
# Entrypoint del contenedor Tor del nodo.
#
# Tor NO resuelve nombres DNS en HiddenServicePort: exige una IP literal. Los nombres de servicio
# de compose (`aegis-relay`, `aegis-caddy`) no valen directamente en el torrc. Aquí los resolvemos
# a su IP actual en la red de Docker (getent) y arrancamos Tor con una copia del torrc ya reescrita
# — así el torrc del repo se mantiene legible con nombres de servicio y portable (VPS incluido).
set -eu

# 1. Permisos que Tor EXIGE en el DataDirectory / HiddenServiceDir: dueño `tor`, modo 700.
mkdir -p /var/lib/tor/aegis-relay /var/lib/tor/aegis-web
chown -R tor:tor /var/lib/tor
chmod 700 /var/lib/tor /var/lib/tor/aegis-relay /var/lib/tor/aegis-web

# 2. Resolver un nombre de servicio de compose a su IP, con reintentos por si el DNS aún no está.
resolve_host() {
	name="$1"
	i=0
	while [ "$i" -lt 30 ]; do
		ip=$(getent hosts "$name" | awk '{ print $1; exit }')
		if [ -n "$ip" ]; then
			echo "$ip"
			return 0
		fi
		echo "aegis-tor: esperando a que resuelva $name... ($i)" >&2
		i=$((i + 1))
		sleep 1
	done
	return 1
}

RELAY_IP=$(resolve_host aegis-relay) || { echo "aegis-tor: ERROR - no resuelve aegis-relay" >&2; exit 1; }
CADDY_IP=$(resolve_host aegis-caddy) || { echo "aegis-tor: ERROR - no resuelve aegis-caddy" >&2; exit 1; }
echo "aegis-tor: aegis-relay -> $RELAY_IP ; aegis-caddy -> $CADDY_IP"

# 3. Reescribir el torrc con las IPs resueltas (el original se monta read-only).
sed -e "s/aegis-relay:8443/${RELAY_IP}:8443/g" \
	-e "s/aegis-caddy:80/${CADDY_IP}:80/g" \
	/etc/tor/torrc > /tmp/torrc.runtime
chown tor:tor /tmp/torrc.runtime

# 4. Bajar privilegios y arrancar Tor como usuario `tor` (no como root).
exec su-exec tor tor -f /tmp/torrc.runtime
