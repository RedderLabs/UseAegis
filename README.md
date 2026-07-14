# Aegis

> El servidor nunca ve remitente, destinatario ni contenido: solo transporta ruido.

Mensajería cifrada extremo a extremo. Una sola función hecha con precisión total:
enviar un mensaje cifrado que llegue. Nada alrededor.

## Monorepo

Gestionado con **pnpm workspaces** + **Turborepo**. La estructura sigue `docs/PLANTILLA.md §1`.

```
aegis/
├── apps/
│   └── web/                 # Landing + cliente web (Next.js 15, App Router)
├── packages/
│   ├── ui-kit/              # Design tokens (DISENO.md) + preset de Tailwind
│   ├── crypto-core/         # libsodium: Ed25519, X25519, XChaCha20-Poly1305, Argon2id
│   ├── transport/           # Abstracción de transporte (Relay / P2P / Mesh)
│   └── protocol/            # Mensajes, versión de protocolo, serialización
└── docs/
    ├── DISENO.md
    ├── PLANTILLA.md
    ├── ARQUITECTURA.md
    └── THREAT_MODEL.md
```

**Regla de monorepo:** ningún paquete de `packages/` importa nada de `apps/`.
El flujo de dependencias va siempre de abajo hacia arriba, para mantener
`crypto-core` y `protocol` auditables de forma aislada.

## Requisitos

- Node ≥ 20 (probado con Node 25)
- pnpm ≥ 11 (`corepack enable` o instalación global)

## Puesta en marcha

```bash
pnpm install
pnpm dev            # levanta todas las apps en modo dev (turbo)
pnpm --filter @aegis/web dev   # solo la web
```

Otros scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`.

## Estado

Código abierto. **Auditoría externa: pendiente** (ver `docs/ARQUITECTURA.md`, roadmap fase 7).
No se afirma ninguna auditoría superada hasta que exista un informe de un tercero citable.

## Seguridad

¿Encontraste una vulnerabilidad? **No abras un issue público.** Sigue la política de
divulgación responsable en [`SECURITY.md`](SECURITY.md) (GitHub Security Advisories o
correo cifrado). El modelo de amenaza está en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Licencia

[**AGPL-3.0-only**](LICENSE). Al ser software de mensajería que corre en red, la AGPL
garantiza que cualquier despliegue accesible por terceros debe ofrecer su código fuente
correspondiente. Así el binario que te da servicio siempre es verificable contra la fuente
publicada — condición necesaria para que las garantías de privacidad sean auditables y no
solo una promesa.

Copyright © RedderLabs. Publicado bajo los términos de la GNU Affero General Public
License, versión 3.
