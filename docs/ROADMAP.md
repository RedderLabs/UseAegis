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

> **Resta de la Fase 1 (mensajería):** ~~cola BullMQ~~ **push en tiempo real ✅** (SSE +
> DragonflyDB pub/sub; el polling queda como red de seguridad), **audio** ✅ y **archivos** ✅,
> **QR** de contacto ✅, **frase de recuperación BIP39** ✅. **Resta**: consolidar cripto/protocolo a
> `packages/crypto-core` + `packages/protocol` (hoy en `apps/web/lib/crypto`), y el push a usuarios
> **offline** (ahí sí BullMQ + web push/VAPID) — movido a tarea futura, no bloquea M1.

---

## Fases

### Fase 1 — MVP Modo A (relay): texto + audio, E2E completo · **✅ HECHA en código** (2026-07-21)
El grueso del proyecto. Hechos el bloque de relay/acceso, el **TEXTO**, los **ARCHIVOS** y el
**AUDIO** E2E, más el pulido de M1: **QR de contacto ✅**, **frase de recuperación BIP39 ✅** y
**push en tiempo real ✅** (SSE + DragonflyDB pub/sub; el polling queda de respaldo). **M1 alcanzado
en código.** Resta a futuro, no bloqueante: consolidar cripto a `packages/crypto-core`+`protocol`,
push a usuarios **offline** (BullMQ + web push) y la prueba manual del micro en navegador real.

| Bloque | Tareas | Estado | Resta |
|---|---|---|---|
| `crypto-core` | Ed25519 / X25519 / Argon2id + almacén ✅. **XChaCha20-Poly1305 + sobre sealed-sender ✅**. **AEAD por chunks (streaming, audio/archivos) ✅** (`aead-stream.ts`, pdte. revisión humana) | 🟢 casi | 0,2 sd |
| `protocol` | Formato de sobre + sealed sender **✅ implementado** (en `apps/web`). **Resta**: subirlo a `packages/protocol` (versión, serialización compartida con móvil) | 🟡 parcial | 0,3 sd |
| `apps/relay` | Fastify + PG + auth/directorio ✅. **Buzón sealed-sender + TTL ✅**. **Almacén de media (proxy a S3/B2, SigV4 propio) ✅**. **Push en tiempo real ✅** (SSE `GET /messages/stream` + pub/sub sobre DragonflyDB; polling como fallback). Cola BullMQ durable → solo para push a offline (tarea futura) | ✅ | — |
| `transport` (Modo A) | `send/onMessage/start/stop` formalizados en `packages/transport` **y ADOPTADOS** por `apps/web/lib/chat.ts` (`createChatTransport` → `createFailoverTransport([createRelayTransport])`): el Canal envía y recibe **a través** de la abstracción, sin sondeo manual. ✅ (ver Fase 2) | ✅ | — |
| Cliente chat (`apps/web`) | **Texto E2E ✅** + **archivos E2E ✅** + **audio E2E ✅** + **QR de contacto ✅** (URI `aegis://contact`, alta por imagen/pegado, verificación del bundle) + **recepción en tiempo real ✅** (SSE, polling de respaldo) | ✅ | — |
| Backup de clave | Código de recuperación ✅ **endurecido a frase BIP39 de 24 palabras ✅** (compatible con el código base64url antiguo). Pdte. revisión humana (`PLANTILLA §5`) | ✅ | — |

**Riesgo humano:** el pipeline de audio (chunking en streaming + reproducción progresiva) es lo que más debugging manual pide; Claude aporta el código, el humano lo estabiliza.
**Hito → M1 (MVP privado usable): dos personas verificadas intercambian texto y audio cifrados por el relay. ✅ ALCANZADO (código).** Texto, archivos y **audio** están implementados y cifrados E2E (media sobre S3/B2). El pipeline cripto/transporte está verificado E2E; la captura de micrófono y la reproducción quedan a falta de una prueba manual en navegador real con micro. Restan solo mejoras (QR, BullMQ, backup) que no bloquean M1.

#### Resta de Fase 1 (no bloqueante para M1) — lista viva

Estos cabos están mencionados arriba en las celdas de la tabla; se agrupan aquí para no tener que
rastrearlos. **Ninguno bloquea M1.**

| # | Qué queda | Tipo | Referencia |
|---|---|---|---|
| 1 | **Consolidar cripto/protocolo a `packages/crypto-core` + `packages/protocol`** (hoy en `apps/web/lib/crypto`): versionar y serializar el sobre para compartirlo con móvil | ~0,5 sd de código | filas `crypto-core` / `protocol` |
| 2 | **Revisión humana de cripto** (`PLANTILLA §5`): `aead-stream.ts` (AEAD por chunks) y el backup BIP39 | trabajo humano, no de código | filas `crypto-core` / Backup |
| 3 | **Push a usuarios _offline_** (BullMQ durable + web push/VAPID): el push en tiempo real por SSE ✅ ya cubre a los conectados | tarea futura | fila `apps/relay` |
| 4 | **Prueba manual del micrófono** en navegador real (captura + reproducción): el pipeline cripto ya está verificado E2E | trabajo humano | Riesgo humano |

> **Pulido de M1 ya hecho, verificado 2026-07-22:** importar la identidad **adjuntando el fichero de
> recuperación** (`aegis-recuperacion-*.txt`), no solo pegando las 24 palabras; y si el `.txt` de
> frase se adjunta por error en el camino de keystore USB, la UI redirige al importador correcto con
> las palabras ya rellenadas (`recovery-phrase.ts::extractRecoveryFromText` + tests).

### Fase 2 — Capa de abstracción de transporte consolidada · ✅ **HECHO** (2026-07-20)
La interfaz `packages/transport/` (ya pensada para B y C, aunque solo exista A) está **endurecida
y adoptada en producción**: deja de ser andamiaje muerto. El cliente de chat (`apps/web/lib/chat.ts`)
crea el transporte con `createChatTransport(token, ownPub)` →
`createFailoverTransport([createRelayTransport({ backend, cursor })])`, donde:
- **`RelayBackend`** adapta el buzón same-origin (`/api`) sobre `relay-client` (`send`/`fetch`/`health`).
- **`CursorStore`** persiste el cursor de recepción en `localStorage` por identidad.
- El **envío** (texto/archivos/audio, con self-copy para continuidad cross-puerta) va por
  `Transport.send`; la **recepción** la posee el transporte (bucle de sondeo + cursor), que entrega
  `WireEnvelope`s ya abiertos y clasificados a los suscriptores. El Canal (`dashboard/page.tsx`)
  solo hace `start/stop` + `subscribe` (se eliminó el `setInterval` manual).

Consecuencia: **añadir Modo B (libp2p) o C (mesh) = extender la lista de candidatos del failover**,
sin tocar al cliente de chat. La cripto de sobre (sellar/abrir, sealed-sender) sigue en el cliente;
el transporte solo mueve bytes opacos (su contrato). Verificado: `transport` tests 5/5, typecheck
web+transport limpio, `next build` OK (el paquete se transpila en el bundle vía `transpilePackages`).

### Fase 2.5 — Endpoint `.onion` del Modo A (`ARQUITECTURA.md §4.1`) · ✅ **HECHO** (2026-07)
Cubierta y **superada**. En vez de un solo `.onion` de relay, se desplegó: hidden service v3 del
**relay** (`zlop6n4…onion`) y de la **WEB** (`gdc65…onion`), Tor contenedorizado (una sola instancia,
SOCKS endurecido a loopback), puerta **clearnet con Caddy** (Let's Encrypt listo) y el modelo
**dos-puertas same-origin** (el relay va como `/api`, el transporte sigue la puerta; sin CORS ni
toggle). Todo desplegado en el **nodo Proxmox**. Detalle en [[aegis-node-deploy]] / [[aegis-switch-onion]]
y `docs/aegis-node-proxmox-setup.md`. **Resta a futuro**: reintento automático clearnet → `.onion`
en el CLIENTE (hoy el usuario elige la puerta), y el SOCKS5 embebido (Arti) para la app nativa.

### Fase 3 — Spike libp2p (Modo B) · 🟡 **EN CURSO** (arrancada 2026-07-22) · *la más difícil de comprimir*
Modo B = puerta P2P resistente a censura, que entra por failover cuando el relay no es alcanzable
*para ti*. Decisiones de red **D1–D4 fijadas** (ver `docs/aegis-fase3-libp2p-spike.md`) para el
navegador (no hay TCP/QUIC crudos):
- **D1 — transportes de navegador:** WebSockets (dial al bootstrap), WebRTC (P2P navegador↔navegador,
  NAT traversal por ICE), circuit-relay v2 (señalización). Noise atado a la Ed25519, yamux. ✅
- **D2 — nodo bootstrap + circuit-relay v2** en el MISMO host único (`infra/p2p-bootstrap`, perfil
  `node` del compose, tras Caddy con `wss`). Código ✅; **deploy pendiente**.
- **D3 — store-and-forward:** el **relay sigue de ANCLA**; **NO** se implementa GossipSub. El Modo B
  resuelve *alcanzabilidad*, no persistencia a offline (límite honesto documentado). ✅
- **D4 — descubrimiento SIN DHT/Kademlia:** el PeerID se **deriva** de la clave Ed25519 del contacto
  (sin lookup) y se disca por el circuito del bootstrap conocido. ✅

**Hecho:** adaptador `createP2pTransport` + contrato + **11/11 tests** (nodo falso en memoria); `P2pNode`
real sobre js-libp2p (`apps/web/lib/p2p/node.ts`); **enganche al failover** en `chat.ts` — `p2p` entra
como 2.º candidato **solo si `NEXT_PUBLIC_P2P_BOOTSTRAP` está definido** (sin él, chat = solo relay,
idéntico a hoy). Nodo creado **perezosamente** (import dinámico, browser-only, nunca SSR) con la clave
libp2p derivada de la identidad **sin que la semilla salga de `identity-store`**. Verificado: 11/11
tests, `tsc` limpio, `next build` OK. `IMPLEMENTED_MODES` sigue `["relay"]` (honesto: no se anuncia
`p2p` hasta validarlo en red real).

**Pendiente (*aquí vive el riesgo*, trabajo humano):** desplegar el bootstrap + cablear
`NEXT_PUBLIC_P2P_BOOTSTRAP`; **dos navegadores en LAN** → sobre E2E ida y vuelta; y **NAT real** entre
dos redes distintas. Ningún test automático cubre libp2p real (`@libp2p/crypto` no resuelve bajo el
runner `tsx`): se valida a mano al conectar navegadores.

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
| 1 · MVP relay — **texto + archivos + audio + QR + BIP39 + push tiempo real E2E ✅ (M1)** | ✅ hecha | — |
| 2 · Abstracción transporte | ✅ hecha | 4,5 sd |
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

- **M1 — MVP privado** (fin Fase 1): **✅ alcanzado en código**. Texto, archivos y audio se intercambian cifrados E2E entre identidades verificadas (pendiente solo prueba manual del micro en navegador). El **acceso** y el **`.onion`** ya están. Resta pulido (QR, BullMQ, backup).
- **M2 — Beta resistente a censura** (fin Fase 4): **~9,5 sd ≈ 2,4 meses**. Relay + `.onion` (✅) + failover a P2P, con indicador de estado.
- **M3 — v1 auditable** (fin Fase 7): **~22,5 sd ≈ 5,5 meses** de ingeniería, **+4–8 semanas** de calendario para la auditoría externa (tercero, en paralelo al cierre).

> Las Fases 3 y 5 son las que más pueden mover el total: son investigación, no
> ingeniería resuelta, y son justamente las que menos se comprimen con asistencia.
> Si el calendario aprieta, el camino más corto a algo usable y defendible es
> cerrar M1 (relay E2E) y M2 (anti-censura) antes de abrir el frente del mesh.
