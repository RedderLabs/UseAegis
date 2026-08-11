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

# --- IP pública anunciada en los candidatos ICE ----------------------------------------------
# En Docker con puertos publicados hay NAT 1:1: sin external-ip, coturn anuncia su IP interna
# (172.x) y los candidatos relay son inservibles desde fuera. Se declara a mano A PROPÓSITO:
# autodetectarla exigiría preguntar a un servicio de terceros (otro observador, justo lo que
# evitamos) y en un host fijo el valor no cambia.
if [ -z "${TURN_EXTERNAL_IP:-}" ]; then
  echo "[coturn] ERROR: falta TURN_EXTERNAL_IP (IP pública IPv4 del host)." >&2
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
# OJO: nada de `-n` aquí — en coturn significa "ignora el fichero de configuración", que dejaría
# el servidor arrancando SIN credenciales ni restricciones. `-c` es lo único que hace falta.
exec turnserver -c "$CONF"
