# Aegis — Roadmap y estimación de desarrollo

> Estimación honesta, no un compromiso de fechas. Los números reflejan un escenario
> concreto (**1 desarrollador + Claude como par**) en semanas de desarrollo, no en
> fechas de calendario. Se revisa al cerrar cada fase, igual que `THREAT_MODEL.md`.

## Supuestos de la estimación

- **Equipo:** 1 desarrollador humano a tiempo completo, con Claude como par de
  programación.
- **Qué comprime Claude:** ingeniería determinista y conocida — wrapper de libsodium,
  `protocol`, scaffolding del relay, componentes de UI, tests y documentación. Estas
  tareas caen hacia el extremo rápido.
- **Qué NO comprime (sigue a ritmo humano):**
  - Revisión de cripto: todo cambio en `crypto-core` exige revisión humana
    (`PLANTILLA.md §5`); Claude puede ser un revisor, pero no sustituye al humano.
  - Integración, debugging y pruebas en dispositivo/red real.
  - Las fases de investigación (libp2p, mesh): el problema no es escribir código, es
    validar comportamiento de red/BLE en el mundo real.
- **Unidad:** semanas de desarrollo (`sd`). 1 mes ≈ 4 sd.
- **Fuera de la estimación de ingeniería:** el tiempo del auditor externo (fase 7)
  es de un tercero (típicamente 4–8 semanas de calendario, aparte).

## Estado actual — hecho

### Fase 0 — Base + capa visual del cliente ✅

| Entregable | Estado |
|---|---|
| Monorepo pnpm + Turborepo (`apps/`, `packages/`, `docs/`) | ✅ |
| Design system `@aegis/ui-kit` (tokens de `stitch-aegis/DESIGN.md`: Cyber Lime + tipografía dual) | ✅ |
| Landing web (`apps/web`, Next.js 15) alineada y honesta | ✅ |
| Flujo de acceso UI: registro (identidad de 16 letras), login, gates `/panel` y `/panel/seguro` con **comprobaciones reales** | ✅ |
| Dashboard UI (Canal / Bóveda / Transporte / Ajustes) con carcasa compartida y favicon dinámico | ✅ |
| Stubs de `crypto-core`, `transport`, `protocol` con contrato e interfaces | ✅ |

### Backend de acceso + transporte (hecho 2026-07 — adelanta parte de Fase 1 y TODA la 2.5) ✅

Más allá de la capa visual: se construyó el **relay real de acceso** y el **transporte `.onion`
completo**, con extras no previstos en el roadmap original (Caddy clearnet, la WEB como su propia
`.onion`, despliegue en el nodo). Ver [[aegis-relay-auth]], [[aegis-node-deploy]], [[aegis-switch-onion]].

| Entregable | Estado |
|---|---|
| Relay REAL: Fastify + PostgreSQL + DragonflyDB (`apps/relay`), migraciones al arrancar | ✅ |
| **Auth real**: identidad Ed25519 + challenge-response (`/auth/challenge` + `/auth/verify`), sesiones con token | ✅ |
| Directorio: handle público + publicación/resolución de **prekeys X25519 firmadas** | ✅ |
| Login / registro del cliente cableados al relay REAL (el **acceso** ya no es mock) | ✅ |
| **Transporte `.onion`** (Tor v3): hidden service del relay **y** de la WEB; SOCKS endurecido a loopback | ✅ (cubre Fase 2.5) |
| Puerta **clearnet** con Caddy (TLS autofirmado en dev; **Let's Encrypt listo** para prod) | ✅ |
| Modelo **"dos puertas" same-origin**: web servida por clearnet y `.onion`; relay como `/api`, el transporte **sigue la puerta** (sin CORS, sin toggle) | ✅ |
| Despliegue en **nodo Proxmox** (LXC, todo en Docker, perfil `node`, restart automático) | ✅ |
| Landing: sección **"Sesión por Tor"** (aviso + descarga Tor Browser + dirección `.onion`) | ✅ |

> **Alcance honesto (actualizado 2026-07-16):** el **acceso** (identidad, registro, login, sesión,
> directorio de prekeys) y el **transporte** (clearnet + `.onion`, dos puertas) son **REALES y
> desplegados**. La **mensajería de TEXTO E2E** (sobre sealed-sender + XChaCha20-Poly1305 + buzón del
> relay + contactos + Canal) ya **funciona de punta a punta**, verificada contra el relay real (ver
> abajo): dos identidades verificadas **ya conversan por texto**. Lo que **todavía NO existe**: cola
> **BullMQ** (hoy el buzón es por polling), **audio** y **archivos** (cifrado en streaming por chunks),
> **QR de contacto**, y toda la capa **P2P/mesh**. El grueso restante de la Fase 1 es **audio + push en
> tiempo real**; P2P, mesh y móvil siguen en fases posteriores.
>
> Nota: los tokens visuales salen de `stitch-aegis/DESIGN.md`, que difiere de `docs/DISENO.md`
> (paleta y tipografía) — reconciliación de ese doc **pendiente**.

### Mensajería de texto E2E (Modo A) — hecho 2026-07-16 (adelanta el grueso de Fase 1) ✅

Primera rebanada vertical de la mensajería, **verificada end-to-end contra el relay real**
(dos identidades: auth → prekey → resolver → sellar → enviar → recibir → abrir). Ver
[[aegis-messaging-phase1]].

| Entregable | Estado |
|---|---|
| Cripto de **contenido**: XChaCha20-Poly1305 + HKDF; sobre **sealed-sender** (X25519 efímero→ECDH con prekey; remitente firmado y cifrado dentro) | ✅ |
| **Buzón del relay** sealed-sender: `POST/GET/DELETE /messages`, cursor incremental, TTL (retiene para continuidad cross-puerta) | ✅ |
| Cliente: `sendMessage/fetchMessages`, **contactos** locales (IndexedDB, prekey verificada anti-MITM), servicio de chat (seal/open + polling) | ✅ |
| **Canal**: desplegable de contactos, alta por nombre de usuario, envío/recepción reales, persistencia local | ✅ |
| **Nombre de usuario** público: reclamar en Ajustes, **autogenerado** (palabra+número, CSPRNG); regex endurecido (`^[a-z][a-z0-9_]{2,19}$`) + **lista de reservados** en el relay (anti-suplantación) | ✅ |
| **Generador de contraseña** fuerte en el registro (longitud + símbolos, CSPRNG) | ✅ |
| Simplificación de **copy** de toda la app a lenguaje claro (algoritmos como detalle secundario) | ✅ |

> **Resta de la Fase 1 (mensajería):** cola **BullMQ** (sustituir polling), **audio**
> (MediaRecorder/Opus + AEAD por chunks) y **archivos** (mismo chunking), **QR** de contacto,
> **frase de recuperación** tipo BIP39, y consolidar cripto/protocolo a `packages/crypto-core` +
> `packages/protocol` (hoy en `apps/web/lib/crypto`).

---

## Fases

### Fase 1 — MVP Modo A (relay): texto + audio, E2E completo · **~3,5 sd restantes** (de 9)
El grueso del proyecto. Ya están hechos el bloque de relay/acceso **y el TEXTO E2E** (ver
"Mensajería de texto E2E" arriba): queda sobre todo **audio, archivos y push en tiempo real**.
Es la **fase en curso**.

| Bloque | Tareas | Estado | Resta |
|---|---|---|---|
| `crypto-core` | Ed25519 / X25519 / Argon2id + almacén ✅. **XChaCha20-Poly1305 + sobre sealed-sender ✅** (en `apps/web/lib/crypto`). **Resta**: AEAD por chunks para streaming (audio/archivos) | 🟡 parcial | 0,5 sd |
| `protocol` | Formato de sobre + sealed sender **✅ implementado** (en `apps/web`). **Resta**: subirlo a `packages/protocol` (versión, serialización compartida con móvil) | 🟡 parcial | 0,3 sd |
| `apps/relay` | Fastify + PG + Dragonfly + auth/directorio ✅. **Buzón sealed-sender + TTL ✅**. **Resta**: cola **BullMQ** (push en tiempo real, sustituir polling) | 🟡 parcial | 0,7 sd |
| `transport` (Modo A) | Funcionalidad Modo A **operativa** en `apps/web/lib/chat.ts` (send/fetch/poll sobre `/api`). **Resta**: formalizar `send/receive/onMessage` en `packages/transport` (hoy stub) | 🟡 parcial | 0,3 sd |
| Cliente chat (`apps/web`) | **Texto E2E ✅** (Canal, contactos, envío/recepción, persistencia, nombre de usuario). **Resta**: QR de contacto, **audio** (MediaRecorder/Opus) + descifrado en streaming, **archivos** | 🟡 parcial | 1,2 sd |
| Backup de clave | Código de recuperación (cifrado, bajo control del usuario) ✅; endurecer a frase tipo BIP39 | 🟢 casi | 0,5 sd |

**Riesgo humano:** el pipeline de audio (chunking en streaming + reproducción progresiva) es lo que más debugging manual pide; Claude aporta el código, el humano lo estabiliza.
**Hito → M1 (MVP privado usable): dos personas verificadas intercambian texto y audio cifrados por el relay.** El **texto ya está** (verificado E2E); falta el **audio** para cerrar M1.

### Fase 2 — Capa de abstracción de transporte consolidada · **1 sd**
Endurecer la interfaz `packages/transport/` ya pensada para B y C (aunque solo exista A). En parte se solapa con la Fase 1.

### Fase 2.5 — Endpoint `.onion` del Modo A (`ARQUITECTURA.md §4.1`) · ✅ **HECHO** (2026-07)
Cubierta y **superada**. En vez de un solo `.onion` de relay, se desplegó: hidden service v3 del
**relay** (`zlop6n4…onion`) y de la **WEB** (`gdc65…onion`), Tor contenedorizado (una sola instancia,
SOCKS endurecido a loopback), puerta **clearnet con Caddy** (Let's Encrypt listo) y el modelo
**dos-puertas same-origin** (el relay va como `/api`, el transporte sigue la puerta; sin CORS ni
toggle). Todo desplegado en el **nodo Proxmox**. Detalle en [[aegis-node-deploy]] / [[aegis-switch-onion]]
y `docs/aegis-node-proxmox-setup.md`. **Resta a futuro**: reintento automático clearnet → `.onion`
en el CLIENTE (hoy el usuario elige la puerta), y el SOCKS5 embebido (Arti) para la app nativa.

### Fase 3 — Spike libp2p (Modo B) · **4 sd** · *la más difícil de comprimir*
DHT/Kademlia (descubrimiento), circuit relay (NAT traversal), GossipSub store-and-forward, capa Noise. Investigación: Claude ayuda con el código, pero validar NAT traversal real es trabajo humano.

### Fase 4 — Failover automático A → B + indicador de estado · **1 sd**
Detección de fallo, conmutación, y el punto verde/ámbar/rojo del header (`DISENO.md §6`).
**Hito → M2 (beta resistente a censura).**

### Track paralelo — `apps/mobile` (React Native / Expo) · **4 sd**
No es una fase suelta: es el cliente donde de verdad viven el audio de campo y el mesh (BLE no es viable en web). Paridad de mensajería con la web. Claude reaprovecha mucha lógica y UI ya escritas para web. Conviene arrancarlo durante las Fases 3–4 para llegar listo a la Fase 5.

### Fase 5 — Modo C: mesh local (BLE / Wi-Fi Aware) · **6 sd** · *la más difícil de comprimir*
Reutiliza el protocolo de mesh de emergencia. Requiere el cliente móvil nativo (track anterior). El testeo multi-dispositivo BLE es intrínsecamente humano y lento.

### Fase 6 — Archivos genéricos · **1 sd**
Mismo pipeline de chunking, solo cambia el MIME type. Barato porque la tubería ya existe desde la Fase 1.

### Fase 7 — Reproducible builds + auditoría externa · **2 sd** (+ auditoría de terceros, aparte)
Dockerfile determinista, hash publicado por release, instrucciones de reproducción. Luego, contratar y acompañar la auditoría externa.
**Hito → M3 (v1 auditable). Solo aquí `AUDIT_PASSED` puede dejar de ser "pendiente".**

---

## Resumen y cronograma (1 dev + Claude)

| Fase | Estimación | Acumulado |
|---|---|---|
| 0 · Base + capa visual del cliente | hecha | — |
| — · Backend de acceso + transporte `.onion` (Fase 2.5 completa + parte de la 1) | hecho (~4 sd) | — |
| 1 · MVP relay — **texto E2E ✅, resta audio/BullMQ/archivos** | 3,5 sd | 3,5 sd |
| 2 · Abstracción transporte | 1 sd | 4,5 sd |
| 2.5 · `.onion` | ✅ hecha | 4,5 sd |
| 3 · libp2p | 4 sd | 8,5 sd |
| 4 · Failover + UI | 1 sd | 9,5 sd |
| — · Móvil (track paralelo) | 4 sd | 13,5 sd |
| 5 · Mesh (BLE / Wi-Fi Aware) | 6 sd | 19,5 sd |
| 6 · Archivos | 1 sd | 20,5 sd |
| 7 · Reproducible + audit | 2 sd | 22,5 sd |

**Total ingeniería restante: ~22,5 sd ≈ 5,5 meses** (–6,5 sd respecto a los 29 previos: la Fase 2.5
`.onion`, ~4 sd de acceso/relay y el **texto E2E** de la Fase 1 ya están entregados y desplegados). Referencia: sigue
entre el escenario ideal de 2 devs y el de 1 dev sin asistencia — Claude tira hacia el lado
rápido, pero el único humano y las fases de investigación (3 y 5) mantienen el suelo.

### Milestones (en semanas relativas desde ahora)

- **M1 — MVP privado** (fin Fase 1): **~3,5 sd ≈ 3–4 semanas**. El **texto E2E ya intercambia** entre dos identidades verificadas; falta el **audio** para cerrar el hito. El **acceso** y el **`.onion`** ya están.
- **M2 — Beta resistente a censura** (fin Fase 4): **~9,5 sd ≈ 2,4 meses**. Relay + `.onion` (✅) + failover a P2P, con indicador de estado.
- **M3 — v1 auditable** (fin Fase 7): **~22,5 sd ≈ 5,5 meses** de ingeniería, **+4–8 semanas** de calendario para la auditoría externa (tercero, en paralelo al cierre).

> Las Fases 3 y 5 son las que más pueden mover el total: son investigación, no
> ingeniería resuelta, y son justamente las que menos se comprimen con asistencia.
> Si el calendario aprieta, el camino más corto a algo usable y defendible es
> cerrar M1 (relay E2E) y M2 (anti-censura) antes de abrir el frente del mesh.
