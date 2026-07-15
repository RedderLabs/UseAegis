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

> **Alcance honesto (actualizado 2026-07-15):** el **acceso** (identidad, registro, login, sesión,
> directorio de prekeys) y el **transporte** (clearnet + `.onion`, dos puertas) son **REALES y
> desplegados**. Lo que **todavía NO existe** es la **MENSAJERÍA**: envío/recepción de mensajes,
> cripto de **contenido** (sobre + sealed sender + `crypto_secretstream`), cola de blobs (BullMQ),
> audio, y toda la capa P2P/mesh. Es decir: ya puedes **entrar de forma segura**, pero aún **no
> conversar**. La Fase 1 se recentra en esa mensajería (abajo), con el acceso y el `.onion` ya resueltos.
>
> Nota: los tokens visuales salen de `stitch-aegis/DESIGN.md`, que difiere de `docs/DISENO.md`
> (paleta y tipografía) — reconciliación de ese doc **pendiente**.

---

## Fases

### Fase 1 — MVP Modo A (relay): texto + audio, E2E completo · **~5 sd restantes** (de 9)
El grueso del proyecto. Parte del bloque de relay/acceso ya está hecho (ver "Backend de acceso"
arriba): quedan **la mensajería y la cripto de contenido**. Es la **siguiente fase**.

| Bloque | Tareas | Estado | Resta |
|---|---|---|---|
| `crypto-core` | Ed25519 / X25519 / Argon2id + almacén de claves ✅ (acceso). **Resta**: XChaCha20-Poly1305 + `crypto_secretstream` (cifrado de contenido/streaming) | 🟡 parcial | 1 sd |
| `protocol` | Formato de sobre, versión, serialización, construcción de **sealed sender** | ⬜ pendiente | 1 sd |
| `apps/relay` | Fastify + PostgreSQL + Dragonfly + auth/directorio ✅. **Resta**: cola BullMQ, entrega sealed-sender, TTL de blobs | 🟡 parcial | 1 sd |
| `transport` (Modo A) | Interfaz única `send/receive/onMessage` sobre el relay (el cliente HTTP `/api` ya existe) | 🟡 parcial | 0,5 sd |
| Cliente chat (`apps/web`) | UI de dashboard ✅. **Resta**: cablear `crypto-core`+`transport` reales para mensajes, QR de contacto, audio (MediaRecorder/Opus) + descifrado en streaming | ⬜ pendiente | 2 sd |
| Backup de clave | Código de recuperación (cifrado, bajo control del usuario) ✅; endurecer a frase tipo BIP39 | 🟢 casi | 0,5 sd |

**Riesgo humano:** el pipeline de audio (chunking en streaming + reproducción progresiva) es lo que más debugging manual pide; Claude aporta el código, el humano lo estabiliza.
**Hito → M1 (MVP privado usable): dos personas verificadas intercambian texto y audio cifrados por el relay.**

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
| 1 · MVP relay — **mensajería (restante)** | 5 sd | 5 sd |
| 2 · Abstracción transporte | 1 sd | 6 sd |
| 2.5 · `.onion` | ✅ hecha | 6 sd |
| 3 · libp2p | 4 sd | 10 sd |
| 4 · Failover + UI | 1 sd | 11 sd |
| — · Móvil (track paralelo) | 4 sd | 15 sd |
| 5 · Mesh (BLE / Wi-Fi Aware) | 6 sd | 21 sd |
| 6 · Archivos | 1 sd | 22 sd |
| 7 · Reproducible + audit | 2 sd | 24 sd |

**Total ingeniería restante: ~24 sd ≈ 6 meses** (–5 sd respecto a los 29 previos: la Fase 2.5
`.onion` completa y ~4 sd de acceso/relay ya están entregados y desplegados). Referencia: sigue
entre el escenario ideal de 2 devs y el de 1 dev sin asistencia — Claude tira hacia el lado
rápido, pero el único humano y las fases de investigación (3 y 5) mantienen el suelo.

### Milestones (en semanas relativas desde ahora)

- **M1 — MVP privado** (fin Fase 1): **~5 sd ≈ 5–6 semanas**. Dos personas verificadas intercambian texto y audio cifrados por el relay (cripto de contenido real). El **acceso** y el **`.onion`** ya están.
- **M2 — Beta resistente a censura** (fin Fase 4): **~11 sd ≈ 2,75 meses**. Relay + `.onion` (✅) + failover a P2P, con indicador de estado.
- **M3 — v1 auditable** (fin Fase 7): **~24 sd ≈ 6 meses** de ingeniería, **+4–8 semanas** de calendario para la auditoría externa (tercero, en paralelo al cierre).

> Las Fases 3 y 5 son las que más pueden mover el total: son investigación, no
> ingeniería resuelta, y son justamente las que menos se comprimen con asistencia.
> Si el calendario aprieta, el camino más corto a algo usable y defendible es
> cerrar M1 (relay E2E) y M2 (anti-censura) antes de abrir el frente del mesh.
