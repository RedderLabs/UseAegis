#!/bin/sh
# Entrypoint del contenedor Tor en COOLIFY.
#
# Igual que infra/tor/entrypoint.sh (nodo) pero resuelve los nombres de servicio de Coolify
# (`relay`, `web`) en vez de (`aegis-relay`, `aegis-caddy`), porque aquí no hay Caddy: la onion
# de la web apunta directa a web:3000. Tor NO acepta nombres DNS en HiddenServicePort (exige IP
# literal), así que resolvemos a IP y reescribimos una copia del torrc — el torrc del repo se
# mantiene legible con nombres de servicio.
set -eu

# 1. Permisos que Tor EXIGE en el DataDirectory / HiddenServiceDir: dueño `tor`, modo 700.
mkdir -p /var/lib/tor/aegis-relay /var/lib/tor/aegis-web
chown -R tor:tor /var/lib/tor
chmod 700 /var/lib/tor /var/lib/tor/aegis-relay /var/lib/tor/aegis-web

# 2. Resolver un nombre de servicio a su IP, con reintentos por si el DNS aún no está.
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

RELAY_IP=$(resolve_host relay) || { echo "aegis-tor: ERROR - no resuelve relay" >&2; exit 1; }
WEB_IP=$(resolve_host web) || { echo "aegis-tor: ERROR - no resuelve web" >&2; exit 1; }
echo "aegis-tor: relay -> $RELAY_IP ; web -> $WEB_IP"

# 3. Reescribir el torrc con las IPs resueltas (el original va horneado read-only en la imagen).
sed -e "s/relay:8443/${RELAY_IP}:8443/g" \
	-e "s/web:3000/${WEB_IP}:3000/g" \
	/etc/tor/torrc > /tmp/torrc.runtime
chown tor:tor /tmp/torrc.runtime

# 4. Bajar privilegios y arrancar Tor como usuario `tor` (no como root).
exec su-exec tor tor -f /tmp/torrc.runtime
