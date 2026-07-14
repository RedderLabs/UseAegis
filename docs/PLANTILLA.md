# Aegis — Plantilla de proyecto

> Documento vivo de referencia para mantener consistencia entre módulos a medida que el proyecto crece. Escrito en español, términos técnicos en inglés, siguiendo el mismo patrón que MASTER_STACK.md.

## 1. Estructura de carpetas

```
visturi/
├── apps/
│   ├── web/                 # Cliente web (Next.js 15)
│   ├── mobile/               # Cliente React Native / Expo (fase posterior)
│   └── relay/                 # Servidor relay (Fastify) — Modo A
├── packages/
│   ├── crypto-core/          # libsodium wrapper: Ed25519, X25519, XChaCha20-Poly1305, Argon2id
│   ├── transport/             # Capa de abstracción de transporte (Modo A/B/C)
│   ├── protocol/              # Definición de mensajes, versión de protocolo, serialización
│   └── ui-kit/                 # Componentes compartidos, design tokens (ver DISEÑO.md)
├── docs/
│   ├── DISENO.md
│   ├── PLANTILLA.md
│   ├── ARQUITECTURA.md
│   └── THREAT_MODEL.md        # Pendiente: qué ve el relay, qué no, qué protege el E2E
└── README.md
```

Regla de monorepo: **ningún paquete de `packages/` importa nada de `apps/`.** El flujo de dependencias es siempre de abajo hacia arriba. Esto mantiene `crypto-core` y `protocol` auditables de forma aislada, sin tener que entender la app entera.

## 2. Convención de nombres

- Componentes UI: `PascalCase`, un archivo por componente (`MessageBubble.tsx`, `FingerprintBar.tsx`).
- Funciones de cripto: verbo explícito + qué hace, nunca abreviado: `encryptAudioChunk()`, no `encAud()`.
- Nunca nombrar una función/variable por cómo está implementada si hay un nombre por lo que hace: `verifyContact()`, no `checkEd25519Signature()` en la capa de UI (sí es válido dentro de `crypto-core`).
- Módulos de transporte con prefijo de modo: `transport-relay/`, `transport-p2p/`, `transport-mesh/`.

## 3. Plantilla para nuevas pantallas

Toda pantalla nueva sigue el mismo esqueleto de layout que ya se validó en el boceto de chat (header/footer fijos, contenido con scroll):

```tsx
<Screen>
  <Header flex="0 0 auto">{/* fijo, nunca crece */}</Header>
  <Content flex="1 1 auto" minHeight={0} overflowY="auto">
    {/* única zona con scroll */}
  </Content>
  <Footer flex="0 0 auto">{/* fijo */}</Footer>
</Screen>
```

Checklist antes de dar por cerrada una pantalla nueva:
- [ ] ¿Header y footer quedan fijos con scroll solo en el contenido?
- [ ] ¿Usa únicamente los tokens de `DISENO.md` (sin colores/tamaños ad-hoc)?
- [ ] ¿Hay algún elemento que filtre metadata no necesaria (timestamp exacto, estado "leído", etc.)? Si sí, quitarlo.
- [ ] ¿El copy sigue las reglas de voz activa y estados vacíos como invitación a actuar?
- [ ] ¿Funciona con foco de teclado visible y sin depender solo de color para comunicar estado?

## 4. Checklist para nuevas features (obligatorio antes de escribir código)

Cada feature nueva es una "incisión" — se justifica por escrito antes de implementarse:

1. **¿Qué corta esta feature?** Una frase: qué problema resuelve, para quién.
2. **¿Qué metadata nueva genera?** (tamaño de archivo, duración, timing, IP, número de intentos...). Si genera metadata explotable, documentar mitigación o aceptar el riesgo explícitamente en `THREAT_MODEL.md`.
3. **¿Qué transporte(s) afecta?** Relay / P2P / Mesh — ¿la feature funciona igual en los tres, o es exclusiva de uno?
4. **¿Reduce o aumenta la superficie auditable?** Si añade una dependencia externa, justificar por qué no se puede hacer con lo que ya está en `crypto-core`.
5. **¿Rompe el principio de UI pobre?** Si añade un elemento visual permanente, debe pasar el checklist de la sección 3.

## 5. Plantilla de commit / PR (para auditabilidad open source)

```
tipo(módulo): descripción corta en imperativo

¿Qué cambia y por qué? (2-3 líneas máx.)

Metadata nueva introducida: ninguna / [detalle]
Transporte(s) afectado(s): relay / p2p / mesh / todos
Amenaza mitigada o aceptada: [referencia a THREAT_MODEL.md si aplica]
```

Tipos: `feat`, `fix`, `crypto` (cualquier cambio en `crypto-core`, requiere doble revisión), `docs`, `refactor`, `chore`.

Todo commit que toque `packages/crypto-core` requiere:
- Referencia explícita al primitivo usado y su documentación oficial (libsodium docs).
- Sin implementaciones propias de primitivos criptográficos — siempre libsodium o equivalente auditado.

## 6. Plantilla de README por módulo

Cada paquete en `packages/` lleva su propio README con esta estructura mínima:

```markdown
# nombre-del-paquete

## Qué hace
(una frase)

## Qué NO hace
(explícito — evita que alguien asuma responsabilidades que no tiene)

## Modelo de amenaza relevante
(qué protege este módulo específicamente, qué no protege)

## Dependencias externas
(lista completa, con justificación de cada una)
```

## 7. Reproducible builds — checklist mínimo v1

- [ ] `Dockerfile` determinista para build del cliente web (versiones fijas, sin `latest`).
- [ ] Hash del build publicado junto a cada release.
- [ ] Instrucciones para que cualquiera reproduzca el mismo binario desde el código fuente y compare hashes.

Esto no es opcional ni "para más adelante" — es lo que hace que "open source y auditable" sea una garantía real y no una etiqueta de marketing.
