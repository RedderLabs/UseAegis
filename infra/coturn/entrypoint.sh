#!/bin/sh
# Entrypoint de coturn: valida el entorno, rellena la plantilla y arranca turnserver.
#
# La plantilla NO se edita a mano: las credenciales llegan por variables de entorno (panel de
# Coolify) para que no acaben nunca en el repo ni en la imagen.
set -eu

TEMPLATE=/etc/coturn/turnserver.conf.template
CONF=/tmp/turnserver.conf

# --- Validación: un TURN sin credenciales es un relevo abierto para cualquiera ---------------
if [ -z "${TURN_USER:-}" ] || [ -z "${TURN_PASSWORD:-}" ]; then
  echo "[coturn] ERROR: faltan TURN_USER y/o TURN_PASSWORD." >&2
  echo "[coturn] Un TURN sin autenticación es ancho de banda gratis para cualquiera. Abortando." >&2
  exit 1
fi

# --- Resolución de la IP pública --------------------------------------------------------------
# Solo IPv4 y descartando el bucle local: el resolutor de Docker (127.0.0.11) aparece en la salida
# de nslookup y no debe colarse como candidato.
resolve_ipv4() {
  _host="$1"
  _ip=""
  if command -v getent >/dev/null 2>&1; then
    _ip=$(getent ahostsv4 "$_host" 2>/dev/null | awk 'NR==1 {print $1}' || true)
  fi
  if [ -z "$_ip" ]; then
    _ip=$(nslookup "$_host" 2>/dev/null \
      | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' \
      | grep -v '^127\.' \
      | tail -n1 || true)
  fi
  case "$_ip" in
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) printf '%s' "$_ip" ;;
    *) printf '' ;;
  esac
}

# --- IP pública anunciada en los candidatos ICE ----------------------------------------------
# En Docker con puertos publicados hay NAT 1:1: sin external-ip, coturn anuncia su IP interna
# (172.x) y los candidatos relay son inservibles desde fuera.
#
# Dos formas de declararla, por orden de preferencia:
#
#   TURN_EXTERNAL_HOST — nombre DDNS del propio host (p. ej. `redderlabs.duckdns.org`). Es la
#     opción recomendada cuando el ISP renumera: el nombre ya lleva la IP correcta, así que el
#     valor se refresca solo y no hay que tocar el panel ni redesplegar. NO añade un observador
#     nuevo al modelo de amenaza: es una resolución DNS de un registro NUESTRO, no preguntarle
#     "¿cuál es mi IP?" a un tercero (que sí vería a este servidor como cliente suyo).
#   TURN_EXTERNAL_IP — valor fijo. Sigue siendo válido, y actúa de red de seguridad si el DNS
#     no responde durante el arranque.
#
# Si el nombre resuelve, gana sobre el valor fijo: es la fuente que se mantiene al día.
if [ -n "${TURN_EXTERNAL_HOST:-}" ]; then
  RESOLVED=$(resolve_ipv4 "$TURN_EXTERNAL_HOST")
  if [ -n "$RESOLVED" ]; then
    if [ -n "${TURN_EXTERNAL_IP:-}" ] && [ "$RESOLVED" != "$TURN_EXTERNAL_IP" ]; then
      echo "[coturn] ${TURN_EXTERNAL_HOST} resuelve a ${RESOLVED}; TURN_EXTERNAL_IP dice ${TURN_EXTERNAL_IP}. Mando el DNS."
    else
      echo "[coturn] external-ip por DNS: ${TURN_EXTERNAL_HOST} -> ${RESOLVED}"
    fi
    TURN_EXTERNAL_IP="$RESOLVED"
  elif [ -n "${TURN_EXTERNAL_IP:-}" ]; then
    echo "[coturn] AVISO: no se pudo resolver ${TURN_EXTERNAL_HOST}. Uso el valor fijo ${TURN_EXTERNAL_IP}." >&2
  else
    echo "[coturn] ERROR: ${TURN_EXTERNAL_HOST} no resuelve y no hay TURN_EXTERNAL_IP de respaldo." >&2
    exit 1
  fi
fi

if [ -z "${TURN_EXTERNAL_IP:-}" ]; then
  echo "[coturn] ERROR: falta TURN_EXTERNAL_IP (IP pública IPv4 del host) o TURN_EXTERNAL_HOST." >&2
  echo "[coturn] Sin ella los candidatos ICE salen con la IP interna del contenedor." >&2
  exit 1
fi

TURN_REALM="${TURN_REALM:-useaegis.app}"

# --- Plantilla → configuración ---------------------------------------------------------------
# `sed` en vez de envsubst: no añade dependencia y la contraseña no pasa por la línea de
# órdenes (no aparece en `ps`). El separador es `|` porque el realm puede llevar `/`.
sed \
  -e "s|__TURN_EXTERNAL_IP__|${TURN_EXTERNAL_IP}|g" \
  -e "s|__TURN_REALM__|${TURN_REALM}|g" \
  -e "s|__TURN_USER__|${TURN_USER}|g" \
  -e "s|__TURN_PASSWORD__|${TURN_PASSWORD}|g" \
  "$TEMPLATE" > "$CONF"

# --- TLS opcional -----------------------------------------------------------------------------
# Con certificado montado se habilita turns:5349; sin él, se comentan las líneas cert/pkey y
# coturn arranca solo con turn:3478 (que ya es suficiente: el payload va cifrado E2E encima).
CERT="${TURN_CERT:-/etc/coturn/certs/fullchain.pem}"
PKEY="${TURN_PKEY:-/etc/coturn/certs/privkey.pem}"

if [ -r "$CERT" ] && [ -r "$PKEY" ]; then
  sed -i -e "s|__TURN_CERT__|${CERT}|g" -e "s|__TURN_PKEY__|${PKEY}|g" "$CONF"
  echo "[coturn] TLS activo: turns:5349 con ${CERT}"
else
  sed -i -e '/__TURN_CERT__/d' -e '/__TURN_PKEY__/d' -e '/^tls-listening-port=/d' "$CONF"
  echo "[coturn] Sin certificado legible en ${CERT}: arranca SOLO turn:3478 (sin turns:)."
fi

# La configuración lleva la contraseña en claro: solo el dueño del proceso puede leerla.
chmod 600 "$CONF"

echo "[coturn] realm=${TURN_REALM} external-ip=${TURN_EXTERNAL_IP} relay=49160-49200"

# --- Vigilancia de la IP (solo con TURN_EXTERNAL_HOST) ----------------------------------------
# external-ip se lee UNA vez al arrancar: si el ISP renumera, coturn seguiría repartiendo una
# dirección de relevo muerta y el TURN fallaría en silencio. Con nombre DDNS se puede detectar:
# se re-resuelve cada TURN_WATCH_INTERVAL segundos y, al cambiar, se sale para que Docker
# (`restart: unless-stopped`) rearranque el contenedor con el valor nuevo.
#
# El cambio debe confirmarse en DOS lecturas seguidas antes de reiniciar. Sin ese freno, un DNS
# que oscile entre dos respuestas metería el contenedor en un bucle de reinicios — y un bucle así
# no se queda en coturn: Coolify para la aplicación ENTERA al pasarse de max_restart_count.
# TURN_WATCH_INTERVAL=0 desactiva la vigilancia.
WATCH="${TURN_WATCH_INTERVAL:-300}"
case "$WATCH" in *[!0-9]*) WATCH=300 ;; esac

if [ -n "${TURN_EXTERNAL_HOST:-}" ] && [ "$WATCH" -gt 0 ]; then
  turnserver -c "$CONF" &
  CHILD=$!
  trap 'kill -TERM "$CHILD" 2>/dev/null || true; exit 0' TERM INT
  CANDIDATE=""
  while kill -0 "$CHILD" 2>/dev/null; do
    sleep "$WATCH"
    NEW=$(resolve_ipv4 "$TURN_EXTERNAL_HOST")
    if [ -z "$NEW" ] || [ "$NEW" = "$TURN_EXTERNAL_IP" ]; then
      CANDIDATE=""
      continue
    fi
    if [ "$NEW" = "$CANDIDATE" ]; then
      echo "[coturn] la IP pública cambió: ${TURN_EXTERNAL_IP} -> ${NEW}. Reinicio para reanunciarla."
      kill -TERM "$CHILD" 2>/dev/null || true
      wait "$CHILD" 2>/dev/null || true
      exit 0
    fi
    echo "[coturn] ${TURN_EXTERNAL_HOST} devuelve ${NEW} (era ${TURN_EXTERNAL_IP}). Confirmo en la próxima lectura."
    CANDIDATE="$NEW"
  done
  wait "$CHILD"
  exit $?
fi

# OJO: nada de `-n` aquí — en coturn significa "ignora el fichero de configuración", que dejaría
# el servidor arrancando SIN credenciales ni restricciones. `-c` es lo único que hace falta.
exec turnserver -c "$CONF"
