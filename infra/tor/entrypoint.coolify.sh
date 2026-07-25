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

# NB: la onion P2P (Modo B) NO es un HiddenServiceDir nuevo — es un puerto virtual (9001) sobre la
# onion de la WEB (mismo aegis-web), así que no hace falta crear ni permisar un directorio aparte.

# 2. Resolver un nombre de servicio a su IP, con reintentos por si el DNS aún no está.
# PREFIERE IPv4 (relay/web escuchan en 0.0.0.0): la red interna de Coolify es dual-stack y
# `getent hosts` puede devolver la IPv6 primero — meterla sin corchetes rompería el torrc
# (`HiddenServicePort 80 fd63::b:3000` es inválido). Si SOLO hubiera IPv6, se emite entre
# corchetes (`[fd63::b]`), la forma que Tor exige para IPv6.
resolve_host() {
	name="$1"
	i=0
	while [ "$i" -lt 30 ]; do
		# Todas las direcciones que resuelva el DNS interno (una por línea, IP en $1).
		addrs=$(getent ahosts "$name" 2>/dev/null | awk '{ print $1 }')
		# Preferir IPv4 (sin corchetes): es donde escuchan relay/web (0.0.0.0).
		ip=$(echo "$addrs" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
		if [ -n "$ip" ]; then
			echo "$ip"
			return 0
		fi
		# Solo si NO hay IPv4: usar IPv6 entre corchetes (forma que Tor exige).
		ip6=$(echo "$addrs" | grep ':' | head -n1)
		if [ -n "$ip6" ]; then
			echo "[$ip6]"
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

# El bootstrap P2P (Modo B) es OPCIONAL: si no está desplegado, se ELIMINA su HiddenServicePort del
# torrc de runtime para que las onion de web/relay arranquen igual (Tor rechazaría un nombre DNS sin
# resolver). Si está, se sustituye por su IP como con relay/web.
if P2P_IP=$(resolve_host p2p-bootstrap); then
	echo "aegis-tor: p2p-bootstrap -> $P2P_IP"
	P2P_SED="s/p2p-bootstrap:9001/${P2P_IP}:9001/g"
else
	echo "aegis-tor: aviso - no resuelve p2p-bootstrap; la onion P2P (Modo B) queda deshabilitada" >&2
	P2P_SED="/p2p-bootstrap:9001/d"
fi

# 3. Reescribir el torrc con las IPs resueltas (el original va horneado read-only en la imagen).
sed -e "s/relay:8443/${RELAY_IP}:8443/g" \
	-e "s/web:3000/${WEB_IP}:3000/g" \
	-e "$P2P_SED" \
	/etc/tor/torrc > /tmp/torrc.runtime
chown tor:tor /tmp/torrc.runtime

# 4. Bajar privilegios y arrancar Tor como usuario `tor` (no como root).
exec su-exec tor tor -f /tmp/torrc.runtime
