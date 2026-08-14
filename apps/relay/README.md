# @aegis/relay

Relay del **Modo A** (`docs/ARQUITECTURA.md §4`). Este paquete arranca con la capa de
**Auth / AuthSession**: Fastify + PostgreSQL, autenticación por **challenge-response
Ed25519** y sesiones con token opaco. Redis + BullMQ (cola de blobs sealed-sender) se
añadirán encima de esta base.

## Modelo de identidad

No hay cuentas, ni email, ni contraseñas. La identidad **es** la clave pública Ed25519
del usuario (32 bytes). Autenticarse = demostrar que posees la clave privada firmando un
nonce que da el servidor. El relay nunca ve material secreto: solo la clave pública, un
hash de token de sesión y (más adelante) blobs cifrados.

## Puesta en marcha (dev)

```bash
pnpm install
pnpm --filter @aegis/relay dev
```

El script `dev` **levanta la BBDD por sí solo**: hace `docker compose up -d --wait aegis-db`,
aplica las migraciones y arranca Fastify con recarga en caliente (`tsx watch`). No hace
falta arrancar Postgres a mano.

Requiere Docker Desktop en marcha. La configuración **no vive aquí**: hay un único `.env` en la
**raíz del repo** (copia `../../.env.example` → `../../.env`) y los scripts de este paquete lo leen
con `dotenv -e ../../.env`. Es a propósito: la contraseña de Postgres la usan tanto
`docker-compose.yml` (para crear el contenedor) como el relay (para conectarse), y cuando vivía en
dos ficheros se desincronizó. La `DATABASE_URL` se **deriva** allí de `POSTGRES_*`, así que no se
puede volver a desincronizar. Lo que significa cada variable sigue documentado en `src/config.ts`.

### Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | BBDD arriba + migraciones + servidor con watch |
| `pnpm db:up` / `pnpm db:down` | arranca / para PostgreSQL (conserva datos) |
| `pnpm db:reset` | borra el volumen, recrea y migra desde cero |
| `pnpm migrate` / `pnpm migrate:down` | aplica / revierte migraciones |
| `pnpm migrate:create` | crea una migración SQL nueva en `migrations/` |
| `pnpm test` | levanta BBDD + migra + corre los tests de integración (node:test) |
| `pnpm build` / `pnpm typecheck` | compila / chequea tipos |

## API

Base URL en dev: `http://127.0.0.1:8443`

### `POST /auth/challenge`
```jsonc
// req
{ "publicKey": "<base64url de 32 bytes>" }
// 201
{
  "challengeId": "<uuid>",
  "nonce": "<base64url>",
  "message": "<base64url>",   // exactamente lo que hay que firmar
  "expiresAt": "<ISO-8601>"
}
```

### `POST /auth/verify`
El cliente firma `message` (= `"aegis-auth:v1:" || nonce`) con su clave privada Ed25519.
```jsonc
// req
{ "challengeId": "<uuid>", "signature": "<base64url de 64 bytes>" }
// 200
{
  "token": "<bearer, base64url>",   // se muestra una sola vez
  "expiresAt": "<ISO-8601>",
  "identity": { "publicKey": "...", "fingerprint": "..." }
}
```

### `GET /auth/me`  ·  `POST /auth/logout`
Requieren `Authorization: Bearer <token>`. `me` devuelve la identidad; `logout` revoca la
sesión (204).

### `GET /health`
`{ "status": "ok", "db": "up" }` — incluye un ping real a PostgreSQL.

## Esquema

`migrations/1731000000000_init-auth.sql`:

- **`identities`** — una fila por clave pública Ed25519 (registro perezoso en el primer login).
- **`auth_challenges`** — nonces efímeros de un solo uso, con expiración corta.
- **`auth_sessions`** — sesiones; se guarda solo el **SHA-256** del token, nunca el token.

## Decisiones de diseño

- **Verificación Ed25519 con `node:crypto`**, sin librerías (se envuelve la clave cruda con
  la cabecera SPKI de RFC 8410). Coherente con "cero magia, todo auditable".
- **Tokens de sesión hasheados** en reposo: una filtración de la tabla no permite suplantar.
- **Challenges single-use + transacción** en `/auth/verify`: sin oráculo de reintento de firma.
- **Separación de dominio** (`aegis-auth:v1:`) en el mensaje firmado: la firma no es
  reutilizable fuera de este handshake.

## Endurecimiento

- **Rate-limiting por IP** (`@fastify/rate-limit`): límite global + límites más estrictos
  en `/auth/challenge` y `/auth/verify` (los abusables). Ajustable por env
  (`RL_*`). Detrás de proxy usa `X-Forwarded-For` (`trustProxy`). Supera el límite → `429`.
- **Barrido de mantenimiento** (`src/auth/maintenance.ts`): tarea en proceso que borra
  periódicamente challenges y sesiones vencidas (`MAINTENANCE_INTERVAL_SECONDS`).
- **CORS** (`@fastify/cors`): orígenes permitidos vía `CORS_ORIGINS` (por defecto el web
  local en `:3000`), para que el cliente web pueda llamar a la API de auth.
- **Tests de integración** (`src/auth/auth.test.ts`, `node:test` + `app.inject`): handshake
  completo, validaciones, replay single-use, firma inválida, rate-limit y barrido.

## Cliente web

`apps/web` ya usa este relay para el login real (modelo *keypair en el dispositivo*):
genera un par Ed25519 (clave privada en IndexedDB), pide un challenge, lo firma y guarda
el token. Ver `apps/web/lib/crypto/` y `apps/web/lib/relay-client.ts`. Arranca ambos:

```bash
pnpm --filter @aegis/relay dev   # relay + Postgres + Redis
pnpm --filter @aegis/web dev     # web en :3000
```

### Pendiente (siguientes iteraciones)

- Redis + BullMQ y los endpoints de cola de blobs sealed-sender (el Redis ya está listo).
- Mover el store de rate-limit a Redis cuando haya más de una instancia de relay.
- Migrar la cripto del cliente (`apps/web/lib/crypto`) a `@aegis/crypto-core` (libsodium)
  cuando ese paquete se implemente.
