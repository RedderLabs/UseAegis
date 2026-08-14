# Aegis

> El servidor nunca ve remitente, destinatario ni contenido: solo transporta ruido.

Mensajería cifrada extremo a extremo, de código abierto y auditable. Una sola función hecha
con precisión total: enviar un mensaje cifrado que llegue. Nada alrededor — sin perfiles, sin
telemetría, sin cuentas.

**En vivo:** [useaegis.app](https://useaegis.app) · también como servicio oculto **.onion** (Tor v3).

## Qué funciona hoy

- **Mensajería E2E** — texto, archivos y notas de voz. Sobre *sealed-sender* (XChaCha20-Poly1305
  para el contenido, X25519 para el acuerdo de clave, Ed25519 para la firma). El relay solo ve
  ciphertext opaco: ni el texto, ni de quién viene. Los adjuntos van cifrados a S3/B2 (el relay
  hace de proxy; nunca ve el claro ni la clave).
- **Identidad local** — clave Ed25519 protegida con passphrase (Argon2id), en el dispositivo.
  Recuperación por **frase BIP39** (24 palabras) o fichero. **QR de contacto** verificable.
- **Cifrado de conocimiento cero** (arquitectura *zero-access*): la cifra ocurre en tu dispositivo;
  el servidor no puede leer nada aunque quisiera. No son *pruebas ZK*: es que el servidor solo
  mueve ruido.
- **Tiempo real** — push por **SSE** (con pub/sub sobre DragonflyDB); *polling* como red de seguridad.
- **Dos puertas, mismo cifrado** — clearnet (HTTPS) y **servicio oculto .onion** (Tor v3, endurecido
  con PoW/anti-DoS). La web anuncia el `.onion` con la cabecera estándar **`Onion-Location`**
  (preservando la ruta), así Tor Browser ofrece saltar a la **misma página** del servicio oculto.
- **Transporte intercambiable** — el mismo cifrado sobre varios caminos, con *failover* **automático**:
  el cliente intenta el relay primero y, si no es alcanzable **para ti**, entrega por P2P. La
  conmutación no la decides tú: dos fallos seguidos dan un modo por caído, y una sonda cada 15 s lo
  devuelve solo en cuanto vuelve. El header lo dice con un punto de color, y el detalle se abre al
  pulsarlo.
  - **Modo A · Relay** — ✅ en producción.
  - **Modo B · P2P (libp2p)** — ✅ **en producción, validado en red real**: con el relay **apagado**,
    un mensaje viajó de navegador a navegador y llegó al destinatario. WebRTC + circuit-relay v2
    (solo señalización), Noise sobre tu Ed25519; el contacto se localiza por su **PeerID derivado de
    su clave pública** — sin DHT y sin directorio que consultar. Funciona por **ambas puertas**: en
    clearnet, WebRTC directo; sobre `.onion`, **reenviado por el circuit-relay** (no hay WebRTC sobre
    Tor), con el mismo sobre E2E — pero ahí el relay ve *metadatos*, nunca contenido.
    *Límite honesto:* validado en NAT permisiva. La travesía **NAT-a-NAT entre redes distintas**
    necesita STUN/TURN autoalojado — el enganche existe (`NEXT_PUBLIC_P2P_ICE_SERVERS`), falta la
    prueba de campo. Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §4.
  - **Modo C · Mesh local** (BLE / Wi-Fi Aware) — futuro (cliente móvil).

## Monorepo

Gestionado con **pnpm workspaces** + **Turborepo**.

```
aegis/
├── apps/
│   ├── web/                # Landing + cliente web (Next.js 15, App Router)
│   └── relay/              # Servidor relay (Fastify + PostgreSQL): buzón sealed-sender,
│                           #   auth Ed25519 challenge-response, directorio de prekeys, media
├── packages/
│   ├── ui-kit/             # Design tokens (Terminal Chic) + preset de Tailwind
│   ├── transport/          # Abstracción de transporte: Relay ✅ / P2P (libp2p) ✅ / Mesh 🚧
│   ├── crypto-core/        # Placeholder — hoy la cripto vive en apps/web/lib/crypto
│   └── protocol/           # Placeholder — sobre/serialización (consolidación pendiente)
├── infra/
│   ├── caddy/              # Reverse proxy (TLS clearnet + .onion) para el despliegue en nodo
│   ├── tor/                # Servicio oculto v3 (.onion) endurecido (PoW / anti-DoS)
│   └── p2p-bootstrap/      # Nodo bootstrap + circuit-relay v2 (Modo B, Fase 3)
└── docs/
    └── ARQUITECTURA.md · ROADMAP.md · THREAT_MODEL.md
```

**Regla de monorepo:** ningún paquete de `packages/` importa nada de `apps/`. El flujo de
dependencias va siempre de abajo hacia arriba, para mantener la cripto y el protocolo auditables
de forma aislada. (Consolidar la cripto de `apps/web/lib/crypto` a `packages/crypto-core` +
`packages/protocol` es una tarea pendiente del roadmap, no bloqueante.)

## Requisitos

- Node ≥ 20 (los contenedores usan Node 22)
- pnpm ≥ 11 (`corepack enable` o instalación global)
- Docker (opcional en dev, para levantar PostgreSQL del relay)

## Puesta en marcha

```bash
cp .env.example .env           # ÚNICO fichero de variables: no hay .env dentro de apps/
pnpm install
pnpm dev                       # levanta web + relay en modo dev (turbo)
pnpm --filter @aegis/web dev   # solo la web (la landing no necesita el relay)
```

Las variables están **centralizadas en el `.env` de la raíz**: lo carga `docker-compose.yml` por sí
solo, y los scripts de `apps/relay` y `apps/web` lo leen con `dotenv -e ../../.env`. La
`DATABASE_URL` se **deriva** de `POSTGRES_*` en ese mismo fichero, así que las credenciales que usa
Docker para crear la BBDD y las que usa el relay para conectarse no pueden desincronizarse.

Otros scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, y `pnpm --filter @aegis/transport test`.

> El `dev` del relay levanta su PostgreSQL en Docker. Si Docker no está arrancado, la web sigue
> funcionando (landing, cifrado en cliente); solo fallan las operaciones que tocan el buzón.

## Estado

**M1 (MVP privado usable) alcanzado en código:** dos personas verificadas intercambian texto,
archivos y audio cifrados E2E por el relay, en clearnet o por `.onion`.

**Fase 3 (Modo B, libp2p) cerrada:** el P2P está desplegado y **validado en red real** — dos
navegadores con el relay apagado intercambiaron un mensaje directo.

**Fase 4 (failover automático + indicador) cerrada en código:** la conmutación entre caminos es
automática y con umbral (dos fallos seguidos dan un modo por caído; una sonda cada 15 s lo devuelve
cuando vuelve), y el estado es visible: punto verde (relay) / ámbar (P2P) / naranja (malla) / rojo
(sin ruta) en el header, con el detalle bajo demanda. Bloquear la sesión apaga también el nodo P2P.

**M2 (beta resistente a censura) alcanzado en código.** Lo que queda es **de campo, no de teclado**:
levantar STUN/TURN autoalojado y probar el Modo B entre **dos redes distintas** — ahí vive el riesgo
residual. Detalle y estimaciones en [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Auditoría externa: pendiente** (roadmap fase 7). No se afirma ninguna auditoría superada hasta
que exista un informe de un tercero citable.

## Seguridad

¿Encontraste una vulnerabilidad? **No abras un issue público.** Sigue la política de divulgación
responsable en [`SECURITY.md`](SECURITY.md) (GitHub Security Advisories o correo cifrado). El modelo
de amenaza está en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Licencia

[**AGPL-3.0-only**](LICENSE). Al ser software de mensajería que corre en red, la AGPL garantiza que
cualquier despliegue accesible por terceros debe ofrecer su código fuente correspondiente. Así el
binario que te da servicio siempre es verificable contra la fuente publicada — condición necesaria
para que las garantías de privacidad sean auditables y no solo una promesa.

Copyright © RedderLabs. Publicado bajo los términos de la GNU Affero General Public License,
versión 3.
