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
- **Transporte intercambiable** — el mismo cifrado sobre varios caminos, con *failover* automático:
  - **Modo A · Relay** — ✅ en producción.
  - **Modo B · P2P (libp2p)** — 🚧 código completo (WebRTC + circuit-relay v2, PeerID derivado de la
    identidad, sin DHT); pendiente la validación de red real. Ver `docs/aegis-fase3-libp2p-spike.md`.
  - **Modo C · Mesh local** (BLE / Wi-Fi Aware) — futuro (cliente móvil).

## Monorepo

Gestionado con **pnpm workspaces** + **Turborepo**. La estructura sigue `docs/PLANTILLA.md §1`.

```
aegis/
├── apps/
│   ├── web/                # Landing + cliente web (Next.js 15, App Router)
│   └── relay/              # Servidor relay (Fastify + PostgreSQL): buzón sealed-sender,
│                           #   auth Ed25519 challenge-response, directorio de prekeys, media
├── packages/
│   ├── ui-kit/             # Design tokens (Terminal Chic, DISENO.md) + preset de Tailwind
│   ├── transport/          # Abstracción de transporte: Relay ✅ / P2P (libp2p) 🚧 / Mesh
│   ├── crypto-core/        # Placeholder — hoy la cripto vive en apps/web/lib/crypto
│   └── protocol/           # Placeholder — sobre/serialización (consolidación pendiente)
├── infra/
│   ├── caddy/              # Reverse proxy (TLS clearnet + .onion) para el despliegue en nodo
│   ├── tor/                # Servicio oculto v3 (.onion) endurecido (PoW / anti-DoS)
│   └── p2p-bootstrap/      # Nodo bootstrap + circuit-relay v2 (Modo B, Fase 3)
└── docs/
    ├── ARQUITECTURA.md · ROADMAP.md · THREAT_MODEL.md
    ├── DISENO.md · PLANTILLA.md
    └── aegis-fase3-libp2p-spike.md
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
pnpm install
pnpm dev                       # levanta web + relay en modo dev (turbo)
pnpm --filter @aegis/web dev   # solo la web (la landing no necesita el relay)
```

Otros scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, y `pnpm --filter @aegis/transport test`.

> El `dev` del relay levanta su PostgreSQL en Docker. Si Docker no está arrancado, la web sigue
> funcionando (landing, cifrado en cliente); solo fallan las operaciones que tocan el buzón.

## Estado

**M1 (MVP privado usable) alcanzado en código:** dos personas verificadas intercambian texto,
archivos y audio cifrados E2E por el relay, en clearnet o por `.onion`. **Fase 3 (Modo B, libp2p)
en curso:** el código está completo y verificado (tests, typecheck, build); falta la validación de
red real (NAT-a-NAT). Detalle y estimaciones en [`docs/ROADMAP.md`](docs/ROADMAP.md).

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
