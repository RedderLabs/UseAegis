# Despliegue en Coolify — puerta clearnet (VM-B, useaegis.app)

Guía para desplegar la **puerta clearnet** (web + relay) en Coolify, con **Postgres gestionado
por Coolify** y **TLS/dominio por Traefik** (Let's Encrypt). Reemplaza al `aegis-db` y al Caddy del
`docker-compose.yml` del nodo. Ver el compose en `docker-compose.coolify.yml`.

> Alcance de esta guía: **clearnet en una VM** para probar el flujo completo (auth, texto, archivos,
> audio) E2E, **+ puerta `.onion` opcional en la misma VM** (§9). Aislar la `.onion` en una VM aparte
> (VM-A) y la BBDD compartida por LAN siguen siendo un paso posterior ([[aegis-2vm-coolify]]).

## 0. Requisitos previos

- Coolify corriendo (en tu caso `http://192.168.8.102:8000`).
- **DNS**: `useaegis.app` (registro A) → **IP pública** de la VM de Coolify. *(Ya apunta.)*
- **Puertos 80 y 443** abiertos/reenviados hacia esa VM (Let's Encrypt valida por HTTP-01).
- Claves S3/B2 para media a mano (hoy las de prueba; **rótalas para prod**).

## 1. Proyecto

En Coolify: **+ New → Project** (p. ej. `aegis`), entorno `production`. Crea dentro los dos recursos
siguientes para que compartan red interna.

## 2. Postgres gestionado

1. **+ New → Database → PostgreSQL 16**. Nombre `aegis-db`.
2. Al crearse, abre el recurso y copia el **connection string INTERNO** (algo como
   `postgres://postgres:<pass>@<host-interno>:5432/postgres`). Es el que usará el relay.
3. Para clearnet en una sola VM **no** hace falta "Make it publicly available" (eso era para la
   BBDD compartida de las 2 VMs). Déjalo interno.
4. (Recomendado) Activa **Scheduled Backups** del Postgres: es el punto único de estado.

## 3. Aplicación (Docker Compose)

1. **+ New → Docker Compose** (basado en Git).
2. **Repositorio**: `https://github.com/RedderLabs/UseAegis` · **rama**: `feat/node-onion-tor-caddy`
   (o `main` tras mergear el PR) · **Compose file**: `docker-compose.coolify.yml`.
3. Coolify detecta dos servicios: `web` y `relay`.
4. Activa **"Connect To Predefined Network"** en la app, para que resuelva el host interno del
   Postgres del paso 2.

## 4. Variables de entorno (en la app compose)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | el connection string interno del Postgres (paso 2) |
| `S3_ENDPOINT` | `https://s3.us-east-005.backblazeb2.com` (ejemplo B2) |
| `S3_REGION` | `us-east-005` |
| `S3_BUCKET` | tu bucket |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | claves B2 (**rótalas para prod**) |
| `NEXT_PUBLIC_WEB_ONION_URL` | vacío (clearnet-only) |
| `BLOB_TTL_SECONDS` / `MEDIA_TTL_SECONDS` | opcional (por defecto 2592000 = 30 días) |
| `MEDIA_MAX_BYTES` | opcional (por defecto 52428800 = 50 MiB) |

> Sin las 5 `S3_*`, el relay arranca igual pero `/media` responde 503 (sin adjuntos). El texto
> funciona sin ellas.

## 5. Dominio y TLS

- Servicio **`web`** → **Domains** → `https://useaegis.app` (puerto **3000**). Coolify pide el
  certificado Let's Encrypt automáticamente.
- Servicio **`relay`** → **sin dominio** (queda interno; la web le reenvía `/api`).

## 6. Desplegar

Pulsa **Deploy**. En el primer arranque el relay ejecuta `node-pg-migrate up` y crea todo el
esquema en el Postgres vacío (identidades, directorio, buzón `messages`, `media_objects`, bloqueos).
El build tarda un poco (hace `pnpm install` del workspace).

## 7. Verificar

1. `https://useaegis.app` → carga la landing.
2. `https://useaegis.app/api/health` → `{"status":"ok","db":"up"}` (valida relay **y** BBDD **y** el
   reenvío same-origin web→relay).
3. En dos navegadores/identidades: registrar → reclamar nombre de usuario → añadir contacto →
   enviar **texto**, **un archivo** y una **nota de voz**. La nota de voz necesita permiso de
   micrófono (solo funciona en contexto seguro HTTPS, que Coolify ya da).

## 8. Después (no bloquea la prueba)

- **Rotar** las claves S3 a las de producción.
- **Puerta `.onion`**: ya soportada en la MISMA VM con el servicio `tor` del compose (§9). Aislarla
  en VM-A aparte (web+relay+tor apuntando su `DATABASE_URL` a este Postgres por LAN, abriendo 5432
  solo desde la IP de VM-A) queda como endurecimiento posterior. Ver [[aegis-2vm-coolify]].
- **BullMQ** (push en tiempo real) cuando toque: perfil `queue` de Dragonfly ya preparado.

## 9. Puerta `.onion` en la MISMA VM (opcional)

El `docker-compose.coolify.yml` incluye un servicio **`tor`** (perfil siempre activo; bórralo si no
lo quieres). Levanta un hidden service v3 **saliente**: se conecta a la red Tor y **no abre ningún
puerto entrante** → cero superficie de ataque nueva (a diferencia del clearnet, no necesita 80/443).

**Cómo funciona (distinto del nodo):** en Coolify no hay Caddy, así que la onion de la web apunta
**directo a `web:3000`** — el contenedor Next sirve la web y reenvía `/api`→relay same-origin. Los
ficheros son propios de Coolify: `infra/tor/{Dockerfile.coolify,torrc.coolify,entrypoint.coolify.sh}`
(horneados en la imagen; solo persiste el volumen `aegis-tor-data` con las claves).

**Puesta en marcha (huevo-y-gallina, 2 deploys):**

1. **Deploy** con el servicio `tor` incluido. En el 1er arranque genera la dirección `.onion`.
2. **Saca la dirección** (terminal del contenedor `tor` en Coolify, o vía SSH a la VM):
   ```
   docker compose exec tor cat /var/lib/tor/aegis-web/hostname
   ```
3. **Hornéala en el enlace**: pon ese valor en `NEXT_PUBLIC_WEB_ONION_URL` (panel de Coolify,
   build-arg del `web`) y **REDEPLOY** — así la web muestra el botón "abre nuestra .onion". El
   contenido E2E y el same-origin funcionan por la onion sin más cambios (el transporte sigue la
   puerta).

**Colocar vs aislar:** meter Tor en la misma VM de Coolify es lo más simple (una máquina), pero
comparte destino con la puerta clearnet (comprometer el host afecta a ambas). El plan de 2 VMs
([[aegis-2vm-coolify]]) aísla el blast-radius. Para un operador único es razonable colocar.

**¿Reusar la dirección del nodo (`gdc65…onion`) o una nueva?** Por defecto se genera una **nueva**.
Para **conservar** la del nodo Proxmox, copia sus claves al volumen ANTES del 1er arranque de Tor:
`hs_ed25519_public_key`, `hs_ed25519_secret_key` y `hostname` desde
`…/var/lib/tor/aegis-web/` del nodo → el volumen `aegis-tor-data` (ruta `/var/lib/tor/aegis-web/`),
con dueño `tor:tor` y modo `700`. Idem `aegis-relay/` si quieres conservar también la onion directa.

## Gotchas

- **Puerto del dominio**: si Coolify no autodetecta el 3000 del `web`, fíjalo a mano en Domains.
- **`relay` no alcanza el Postgres**: casi siempre es la red — revisa "Connect To Predefined
  Network" y que ambos estén en el mismo proyecto/entorno.
- **Let's Encrypt falla**: comprueba que 80/443 llegan a la VM y que el A de `useaegis.app` resuelve
  a su IP pública (no a la LAN `192.168.8.x`).
- **Micrófono**: las notas de voz exigen HTTPS (contexto seguro). Por `useaegis.app` con TLS, OK.
