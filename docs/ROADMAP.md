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

## Estado actual (Fase 0 + capa visual del cliente — hecho)

| Entregable | Estado |
|---|---|
| Monorepo pnpm + Turborepo (`apps/`, `packages/`, `docs/`) | ✅ |
| Design system `@aegis/ui-kit` (tokens de `stitch-aegis/DESIGN.md`: Cyber Lime + tipografía dual) | ✅ |
| Landing web (`apps/web`, Next.js 15) alineada y honesta | ✅ |
| Flujo de acceso UI: registro (identidad de 16 letras vía Web Crypto), login, gates `/panel` y `/panel/seguro` con **comprobaciones reales** | ✅ |
| Dashboard UI (Canal / Bóveda / Registros / Ajustes) con carcasa compartida y favicon dinámico seguro/inseguro | ✅ |
| Stubs de `crypto-core`, `transport`, `protocol` con contrato e interfaces | ✅ |

> **Alcance honesto:** todo el cliente web es **UI/mockup**. La sesión y la
> "entrega" de mensajes son **locales** (localStorage); todavía no hay cripto real
> ni relay. Esto adelanta la *capa visual* del cliente de la Fase 1, pero **no** su
> integración criptográfica (que sigue siendo el grueso del trabajo).
>
> Nota: los tokens visuales salen de `stitch-aegis/DESIGN.md`, que difiere de
> `docs/DISENO.md` (paleta y tipografía) — reconciliación de ese doc **pendiente**.

---

## Fases

### Fase 1 — MVP Modo A (relay): texto + audio, E2E completo · **9 sd**
El grueso del proyecto. Con 1 humano el trabajo es secuencial, pero Claude acelera
cada bloque de ingeniería. La UI del cliente ya existe (Fase 0), así que el bloque
de cliente baja de 3 a 2 sd: resta lo difícil, no la pantalla.

| Bloque | Tareas | Est. |
|---|---|---|
| `crypto-core` | Wrapper libsodium: Ed25519, X25519, XChaCha20-Poly1305, `crypto_secretstream`, Argon2id; almacén de claves local | 2 sd |
| `protocol` | Formato de sobre, versión de protocolo, serialización, construcción de sealed sender | 1 sd |
| `apps/relay` | Fastify + PostgreSQL + Dragonfly + BullMQ, entrega sealed-sender, TTL de blobs, Docker Compose | 2 sd |
| `transport` (Modo A) | Implementación relay detrás de la interfaz única (`send/receive/onMessage`) | 1 sd |
| Cliente chat (`apps/web`) | **UI ya montada (Fase 0)**; resta: cablear `crypto-core`+`transport` reales (quitar el mock de localStorage), QR de contacto, grabación audio (MediaRecorder/Opus) + descifrado en streaming | 2 sd |
| Backup de clave | Frase de recuperación BIP39, cifrada, bajo control del usuario | 1 sd |

**Riesgo humano:** el pipeline de audio (chunking en streaming + reproducción progresiva) es lo que más debugging manual pide; Claude aporta el código, el humano lo estabiliza.
**Hito → M1 (MVP privado usable).**

### Fase 2 — Capa de abstracción de transporte consolidada · **1 sd**
Endurecer la interfaz `packages/transport/` ya pensada para B y C (aunque solo exista A). En parte se solapa con la Fase 1.

### Fase 2.5 — Endpoint `.onion` del Modo A (`ARQUITECTURA.md §4.1`) · **1 sd**
Daemon Tor sobre el nodo de relay (clave Ed25519 importada), `transport-relay/{clearnet,onion}.ts`, proxy SOCKS5 en cliente, reintento clearnet → `.onion` antes de escalar a Modo B. Servidor sencillo; la fricción está en el SOCKS5 del cliente.

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
| 1 · MVP relay | 9 sd | 9 sd |
| 2 · Abstracción transporte | 1 sd | 10 sd |
| 2.5 · `.onion` | 1 sd | 11 sd |
| 3 · libp2p | 4 sd | 15 sd |
| 4 · Failover + UI | 1 sd | 16 sd |
| — · Móvil (track paralelo) | 4 sd | 20 sd |
| 5 · Mesh (BLE / Wi-Fi Aware) | 6 sd | 26 sd |
| 6 · Archivos | 1 sd | 27 sd |
| 7 · Reproducible + audit | 2 sd | 29 sd |

**Total ingeniería restante: ~29 sd ≈ 7,25 meses** (–1 sd respecto a la estimación
previa de 30, porque la UI del cliente ya está hecha). Referencia: cae entre el
escenario ideal de 2 devs (~24 sd) y el de 1 dev sin asistencia (~35 sd) — Claude
tira hacia el lado rápido, pero el único humano y las fases de investigación
mantienen el suelo.

### Milestones (en semanas relativas desde el arranque de la Fase 1)

- **M1 — MVP privado** (fin Fase 1): **~9 sd ≈ 2–2,5 meses**. Dos personas verificadas intercambian texto y audio cifrados por el relay (cripto y relay reales, ya no mock).
- **M2 — Beta resistente a censura** (fin Fase 4): **~16 sd ≈ 4 meses**. Relay + `.onion` + failover a P2P, con indicador de estado.
- **M3 — v1 auditable** (fin Fase 7): **~29 sd ≈ 7,25 meses** de ingeniería, **+4–8 semanas** de calendario para la auditoría externa (tercero, en paralelo al cierre).

> Las Fases 3 y 5 son las que más pueden mover el total: son investigación, no
> ingeniería resuelta, y son justamente las que menos se comprimen con asistencia.
> Si el calendario aprieta, el camino más corto a algo usable y defendible es
> cerrar M1 (relay E2E) y M2 (anti-censura) antes de abrir el frente del mesh.
