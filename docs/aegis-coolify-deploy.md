# Despliegue en Coolify — puerta clearnet (VM-B, useaegis.app)

Guía para desplegar la **puerta clearnet** (web + relay) en Coolify, con **Postgres gestionado
por Coolify** y **TLS/dominio por Traefik** (Let's Encrypt). Reemplaza al `aegis-db` y al Caddy del
`docker-compose.yml` del nodo. Ver el compose en `docker-compose.coolify.yml`.

> Alcance de esta guía: **solo clearnet en una VM**, para probar el flujo completo (auth, texto,
> archivos, audio) E2E. La `.onion` (VM-A) y la BBDD compartida por LAN son un paso posterior.

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
2. **Repositorio**: `https://github.com/RedderLabs/Aegis` · **rama**: `feat/node-onion-tor-caddy`
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
- **VM-A (.onion)**: web+relay+tor reusando `infra/tor/`, apuntando su `DATABASE_URL` a este mismo
  Postgres por la LAN (abrir 5432 solo desde la IP de VM-A). Ver [[aegis-2vm-coolify]].
- **BullMQ** (push en tiempo real) cuando toque: perfil `queue` de Dragonfly ya preparado.

## Gotchas

- **Puerto del dominio**: si Coolify no autodetecta el 3000 del `web`, fíjalo a mano en Domains.
- **`relay` no alcanza el Postgres**: casi siempre es la red — revisa "Connect To Predefined
  Network" y que ambos estén en el mismo proyecto/entorno.
- **Let's Encrypt falla**: comprueba que 80/443 llegan a la VM y que el A de `useaegis.app` resuelve
  a su IP pública (no a la LAN `192.168.8.x`).
- **Micrófono**: las notas de voz exigen HTTPS (contexto seguro). Por `useaegis.app` con TLS, OK.
