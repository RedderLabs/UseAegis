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

| Entregable                                                                                                                   | Estado |
| ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| Monorepo pnpm + Turborepo (`apps/`, `packages/`, `docs/`)                                                                    | ✅     |
| Design system `@aegis/ui-kit` (tokens de `stitch-aegis/DESIGN.md`: Cyber Lime + tipografía dual)                             | ✅     |
| Landing web (`apps/web`, Next.js 15) alineada y honesta                                                                      | ✅     |
| Flujo de acceso UI: registro (identidad de 16 letras), login, gates `/panel` y `/panel/seguro` con **comprobaciones reales** | ✅     |
| Dashboard UI (Canal / Bóveda / Transporte / Ajustes) con carcasa compartida y favicon dinámico                               | ✅     |
| Stubs de `crypto-core`, `transport`, `protocol` con contrato e interfaces                                                    | ✅     |

### Backend de acceso + transporte (hecho 2026-07 — adelanta parte de Fase 1 y TODA la 2.5) ✅

Más allá de la capa visual: se construyó el **relay real de acceso** y el **transporte `.onion`
completo**, con extras no previstos en el roadmap original (Caddy clearnet, la WEB como su propia
`.onion`, despliegue en el nodo). Ver [[aegis-relay-auth]], [[aegis-node-deploy]], [[aegis-switch-onion]].

| Entregable                                                                                                                                             | Estado              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Relay REAL: Fastify + PostgreSQL + DragonflyDB (`apps/relay`), migraciones al arrancar                                                                 | ✅                  |
| **Auth real**: identidad Ed25519 + challenge-response (`/auth/challenge` + `/auth/verify`), sesiones con token                                         | ✅                  |
| Directorio: handle público + publicación/resolución de **prekeys X25519 firmadas**                                                                     | ✅                  |
| Login / registro del cliente cableados al relay REAL (el **acceso** ya no es mock)                                                                     | ✅                  |
| **Transporte `.onion`** (Tor v3): hidden service del relay **y** de la WEB; SOCKS endurecido a loopback                                                | ✅ (cubre Fase 2.5) |
| Puerta **clearnet** con Caddy (TLS autofirmado en dev; **Let's Encrypt listo** para prod)                                                              | ✅                  |
| Modelo **"dos puertas" same-origin**: web servida por clearnet y `.onion`; relay como `/api`, el transporte **sigue la puerta** (sin CORS, sin toggle) | ✅                  |
| Despliegue en **nodo Proxmox** (LXC, todo en Docker, perfil `node`, restart automático)                                                                | ✅                  |
| Landing: sección **"Sesión por Tor"** (aviso + descarga Tor Browser + dirección `.onion`)                                                              | ✅                  |

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

| Entregable                                                                                                                                                                                           | Estado |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Cripto de **contenido**: XChaCha20-Poly1305 + HKDF; sobre **sealed-sender** (X25519 efímero→ECDH con prekey; remitente firmado y cifrado dentro)                                                     | ✅     |
| **Buzón del relay** sealed-sender: `POST/GET/DELETE /messages`, cursor incremental, TTL (retiene para continuidad cross-puerta)                                                                      | ✅     |
| Cliente: `sendMessage/fetchMessages`, **contactos** locales (IndexedDB, prekey verificada anti-MITM), servicio de chat (seal/open + polling)                                                         | ✅     |
| **Canal**: desplegable de contactos, alta por nombre de usuario, envío/recepción reales, persistencia local                                                                                          | ✅     |
| **Nombre de usuario** público: reclamar en Ajustes, **autogenerado** (palabra+número, CSPRNG); regex endurecido (`^[a-z][a-z0-9_]{2,19}$`) + **lista de reservados** en el relay (anti-suplantación) | ✅     |
| **Generador de contraseña** fuerte en el registro (longitud + símbolos, CSPRNG)                                                                                                                      | ✅     |
| Simplificación de **copy** de toda la app a lenguaje claro (algoritmos como detalle secundario)                                                                                                      | ✅     |

> **Resta de la Fase 1 (mensajería):** ~~cola BullMQ~~ **push en tiempo real ✅** (SSE +
> DragonflyDB pub/sub; el polling queda como red de seguridad), **audio** ✅ y **archivos** ✅,
> **QR** de contacto ✅, **frase de recuperación BIP39** ✅, **cripto/protocolo consolidados a
> `packages/crypto-core` + `packages/protocol` ✅** (2026-08-15). **Resta**: el push a usuarios
> **offline** (ahí sí BullMQ + web push/VAPID) — movido a tarea futura, no bloquea M1.

---

## Fases

### Fase 1 — MVP Modo A (relay): texto + audio, E2E completo · **✅ HECHA en código** (2026-07-21)

El grueso del proyecto. Hechos el bloque de relay/acceso, el **TEXTO**, los **ARCHIVOS** y el
**AUDIO** E2E, más el pulido de M1: **QR de contacto ✅**, **frase de recuperación BIP39 ✅** y
**push en tiempo real ✅** (SSE + DragonflyDB pub/sub; el polling queda de respaldo). **M1 alcanzado
en código.** La cripto y el protocolo ya están **consolidados en sus paquetes ✅** (2026-08-15).
Resta a futuro, no bloqueante: push a usuarios **offline** (BullMQ + web push) y la prueba manual
del micro en navegador real.

| Bloque                    | Tareas                                                                                                                                                                                                                                                                                                | Estado     | Resta  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| `crypto-core`             | Ed25519 / X25519 / Argon2id + almacén ✅. **XChaCha20-Poly1305 + sobre sealed-sender ✅**. **AEAD por chunks (streaming, audio/archivos) ✅** (`aead-stream.ts`, pdte. revisión humana). **Consolidado en `packages/crypto-core` ✅** (2026-08-15)                                                    | ✅         | —      |
| `protocol`                | Formato de sobre + sealed sender ✅. **Consolidado en `packages/protocol` ✅** (2026-08-15): `ENVELOPE_VERSION`, contrato de cable y vector congelado para el móvil                                                                                                                                  | ✅         | —      |
| `apps/relay`              | Fastify + PG + auth/directorio ✅. **Buzón sealed-sender + TTL ✅**. **Almacén de media (proxy a S3/B2, SigV4 propio) ✅**. **Push en tiempo real ✅** (SSE `GET /messages/stream` + pub/sub sobre DragonflyDB; polling como fallback). Cola BullMQ durable → solo para push a offline (tarea futura) | ✅         | —      |
| `transport` (Modo A)      | `send/onMessage/start/stop` formalizados en `packages/transport` **y ADOPTADOS** por `apps/web/lib/chat.ts` (`createChatTransport` → `createFailoverTransport([createRelayTransport])`): el Canal envía y recibe **a través** de la abstracción, sin sondeo manual. ✅ (ver Fase 2)                   | ✅         | —      |
| Cliente chat (`apps/web`) | **Texto E2E ✅** + **archivos E2E ✅** + **audio E2E ✅** + **QR de contacto ✅** (URI `aegis://contact`, alta por imagen/pegado, verificación del bundle) + **recepción en tiempo real ✅** (SSE, polling de respaldo)                                                                               | ✅         | —      |
| Backup de clave           | Código de recuperación ✅ **endurecido a frase BIP39 de 24 palabras ✅** (compatible con el código base64url antiguo). Pdte. revisión humana (`PLANTILLA §5`)                                                                                                                                         | ✅         | —      |

**Riesgo humano:** el pipeline de audio (chunking en streaming + reproducción progresiva) es lo que más debugging manual pide; Claude aporta el código, el humano lo estabiliza.
**Hito → M1 (MVP privado usable): dos personas verificadas intercambian texto y audio cifrados por el relay. ✅ ALCANZADO (código).** Texto, archivos y **audio** están implementados y cifrados E2E (media sobre S3/B2). El pipeline cripto/transporte está verificado E2E; la captura de micrófono y la reproducción quedan a falta de una prueba manual en navegador real con micro. Restan solo mejoras (QR, BullMQ, backup) que no bloquean M1.

#### Resta de Fase 1 (no bloqueante para M1) — lista viva

Estos cabos están mencionados arriba en las celdas de la tabla; se agrupan aquí para no tener que
rastrearlos. **Ninguno bloquea M1.**

| #   | Qué queda                                                                                                                                                                 | Tipo                         | Referencia                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| 1   | ~~Consolidar cripto/protocolo a `packages/crypto-core` + `packages/protocol`~~ **✅ HECHO (2026-08-15)** — ver la sección de abajo                                        | hecho                        | filas `crypto-core` / `protocol` |
| 2   | **Revisión humana de cripto** (`PLANTILLA §5`): `aead-stream.ts` (AEAD por chunks) y el backup BIP39                                                                      | trabajo humano, no de código | filas `crypto-core` / Backup     |
| 3   | **Push a usuarios _offline_** (BullMQ durable + web push/VAPID): el push en tiempo real por SSE ✅ ya cubre a los conectados                                              | tarea futura                 | fila `apps/relay`                |
| 4   | **Prueba manual del micrófono** en navegador real (captura + reproducción): el pipeline cripto ya está verificado E2E                                                     | trabajo humano               | Riesgo humano                    |

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

### Fase 3 — Spike libp2p (Modo B) · ✅ **HECHA** (2026-07-23) — validada en red real · _la más difícil de comprimir_

Modo B = puerta P2P resistente a censura, que entra por failover cuando el relay no es alcanzable
_para ti_. Decisiones de red **D1–D4 fijadas** (ver `docs/aegis-fase3-libp2p-spike.md`) para el
navegador (no hay TCP/QUIC crudos):

- **D1 — transportes de navegador:** WebSockets (dial al bootstrap), WebRTC (P2P navegador↔navegador,
  NAT traversal por ICE), circuit-relay v2 (señalización). Noise atado a la Ed25519, yamux. ✅
- **D2 — nodo bootstrap + circuit-relay v2** en el MISMO host único (`infra/p2p-bootstrap`). Código ✅
  y **desplegado + verificado en prod** (2026-07-23, ver abajo). En prod NO hay Caddy: el `wss` lo
  termina Cloudflare y el routing es Cloudflare Tunnel → Traefik. ✅
- **D3 — store-and-forward:** el **relay sigue de ANCLA**; **NO** se implementa GossipSub. El Modo B
  resuelve _alcanzabilidad_, no persistencia a offline (límite honesto documentado). ✅
- **D4 — descubrimiento SIN DHT/Kademlia:** el PeerID se **deriva** de la clave Ed25519 del contacto
  (sin lookup) y se disca por el circuito del bootstrap conocido. ✅

**Hecho:** adaptador `createP2pTransport` + contrato + **11/11 tests** (nodo falso en memoria); `P2pNode`
real sobre js-libp2p (`apps/web/lib/p2p/node.ts`); **enganche al failover** en `chat.ts` — `p2p` entra
como 2.º candidato **solo si `NEXT_PUBLIC_P2P_BOOTSTRAP` está definido** (sin él, chat = solo relay,
idéntico a hoy). Nodo creado **perezosamente** (import dinámico, browser-only, nunca SSR) con la clave
libp2p derivada de la identidad **sin que la semilla salga de `identity-store`**. Verificado: 11/11
tests, `tsc` limpio, `next build` OK.

**Desplegado y verificado en prod (2026-07-23):** el servicio `p2p-bootstrap` corre en Coolify (mismo
host único que web/relay/tor). `NEXT_PUBLIC_P2P_BOOTSTRAP` se hornea en build-time con el multiaddr
`/dns4/p2p.useaegis.app/tcp/443/wss/p2p/12D3KooW…KURp` (PeerID **determinista** de `P2P_BOOTSTRAP_SEED`,
igual que lo deriva `server.mjs`). Puerta `wss` verificada **e2e**: `wss://p2p.useaegis.app` →
**101 Switching Protocols** (navegador → Cloudflare Tunnel → Traefik:80 → `p2p-bootstrap:9001`; el WS
server responde el `Sec-WebSocket-Accept`, y un `GET` normal da "Only WebSocket connections are
supported"). Dos gotchas de deploy resueltos: **(1)** `next/font/google` descargaba las fuentes de
Google **en build-time** → el server de build (DNS/egress flaky) mataba `next build` en "Creating an
optimized production build"; fix = self-host con `next/font/local` (woff2 variables versionados en
`apps/web/app/fonts/`) → build hermético. **(2)** El dominio del servicio en Coolify
(`http://p2p.useaegis.app:9001` — `http` porque el TLS lo pone Cloudflare, `:9001` = puerto del WS)
para que Traefik cree el router (antes daba su 404 por defecto).

**Validado en red real — el criterio de éxito del spike (2026-07-23):** con **dos navegadores
clearnet** (dos identidades verificadas, ninguno `.onion`) y el **relay APAGADO** (`docker stop`),
un mensaje de A **apareció en el Canal de B**. Es decir: el failover probó el relay (los `500` de
`POST /api/messages` en consola son _esperados_ — relay muerto), agotó ese candidato y **entregó por
P2P** (WebRTC señalizado por el bootstrap/circuit-relay); una entrega P2P correcta **no deja rastro
HTTP** en la consola. Con eso, `IMPLEMENTED_MODES` pasa a **`["relay","p2p"]`**: el Modo B ya se
anuncia como modo con red real.

**Dos aprendizajes de la prueba:** (1) el P2P **no funciona desde Tor por WebRTC** (UDP, bloqueado) —
**abordado** (2026-07-25) llevando el Modo B **por el circuito** sobre Tor, de modo que funcione
indistintamente por `.app` (WebRTC directo) y por `.onion` (reenviado por el circuit-relay, TCP);
_implementado, pendiente validar en deploy_ — ver `docs/aegis-fase3-libp2p-spike.md §3.6`;
(2) el **auth necesita el relay**: con el relay caído no puedes loguearte ni recargar (perderías la
sesión). Es **decisión de diseño** (la sesión se firma contra el relay siempre, para la auditoría),
no un bug a desacoplar. El Modo B mantiene viva una conversación **ya iniciada** cuando el relay se
bloquea; no es un sustituto del arranque de sesión.

> **Caveat honesto del Modo B sobre Tor:** en un navegador, sobre Tor, el sobre lo **reenvía** el
> circuit-relay (el navegador no puede escuchar ni hospedar un onion service). Sigue siendo Modo B
> real (mismo plano libp2p, mismo sobre E2E, **no** el buzón que _almacena_ del Modo A), pero el
> relay ve **metadatos** (quién↔quién, cuándo), nunca el contenido. El P2P directo-sin-relay sobre
> Tor solo existe en la **app nativa + Arti** (track nativo).

**Límite honesto (endurecimiento de Fase 4, no bloquea el cierre):** lo validado es NAT **permisiva**
(ambos navegadores en la misma red). Falta **NAT-a-NAT entre dos redes distintas** — _ahí vive el
riesgo residual_, y es donde probablemente haga falta **TURN** (el circuit-relay v2 cubre la
señalización, no el relevo de media si el ICE falla). Ningún test automático cubre libp2p real
(`@libp2p/crypto` no resuelve bajo el runner `tsx`): se valida a mano con navegadores.

### Fase 4 — Failover automático A → B + indicador de estado · ✅ **HECHA en código** (2026-07-30)

El failover deja de ser "prueba y reza" y pasa a **conmutar solo**, con el estado a la vista.

| Entregable                                                                                                                                                                                                                  | Estado |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Detección** de fallo con umbral: `failureThreshold` fallos CONSECUTIVOS (de envío o de sonda) marcan un modo como caído — un 500 suelto no mueve el indicador                                                             | ✅     |
| **Conmutación**: el modo activo es el primer candidato con ruta; al fallar una entrega, el indicador refleja la ruta REAL en el acto (se distingue "ha fallado" de "se le da por muerto")                                   | ✅     |
| **Recuperación automática**: ronda de sondas (`isAvailable`) cada 15 s que devuelve el activo al candidato preferente en cuanto vuelve — sin recargar y sin que el usuario mande nada                                       | ✅     |
| **Estado observable**: `createFailoverTransport` devuelve un `ObservableTransport` (`status()` + `onStatus()`) con la salud, la latencia y la última conmutación de cada modo                                               | ✅     |
| **Punto de estado del header** (`DISENO.md §6`): verde/ámbar/naranja + rojo de "sin ruta", con el detalle bajo demanda al pulsarlo (`components/TransportStatus.tsx`). Sustituye a la pastilla de sesión y absorbe su aviso | ✅     |
| Bloque **«Failover de transporte»** en la vista Transporte, con el orden de preferencia y el estado de cada candidato                                                                                                       | ✅     |
| **Arrastre de Fase 3** — `node.stop()` atado al bloqueo del keystore (`stopActiveChatTransports()` antes de `lockKeystore()`): bloquear ya no deja el nodo libp2p anunciado en la red                                       | ✅     |
| **Arrastre de Fase 3** — **ICE/TURN configurable** (`NEXT_PUBLIC_P2P_ICE_SERVERS` + credenciales) para el WebRTC de clearnet. Sin STUN público de terceros por defecto: se autoaloja                                        | ✅     |
| **Arrastre de Fase 3** — **coturn autoalojado** empaquetado: servicio del compose de Coolify, config endurecida (credenciales obligatorias, `denied-peer-ip` contra pivote a la red interna, cuotas) y guía de despliegue `docs/aegis-coturn-deploy.md`                                                                  | ✅     |
| **Arrastre de Fase 3** — **desplegar** ese coturn en el host y rellenar `NEXT_PUBLIC_P2P_ICE_SERVERS`                                                                                                                       | ⬜ humano |
| **Arrastre de Fase 3** — validar **NAT-a-NAT entre dos redes distintas** (dos ISP, no la misma LAN) con el TURN autoalojado                                                                                                 | ⬜ humano |

Verificado: `@aegis/transport` **15/15 tests** (4 nuevos: umbral anti-bandazo, recuperación por
sonda, publicación de estado, "sin ruta" sin dejar de intentar), `tsc` limpio en web y transport,
`next build` OK.

**Resta para cerrar M2 (trabajo humano, no de código):** desplegar el coturn ya empaquetado
(`docs/aegis-coturn-deploy.md`), rellenar `NEXT_PUBLIC_P2P_ICE_SERVERS` y probar el Modo B entre
**dos redes distintas** — ahí vive el riesgo residual del Modo B, y ningún test automático lo cubre.
**Hito → M2 (beta resistente a censura).**

### Entre fases — Cuota de almacenamiento por identidad · ✅ **HECHA** (relay 2026-08-11 · UI 2026-08-14)

No es una fase del roadmap original: es el agujero que se vio al mirar los números. `media_objects`
no tiene columna de propietario (a propósito, por sealed-sender), así que no existía **ningún** techo
por identidad — solo el tamaño por objeto y el rate-limit por IP, que multiplicados dejaban subir del
orden de **8 TiB/día** a una sola identidad autenticada.

| Entregable                                                                                                                                                                     | Estado |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `storage_usage(identity, day, bytes)`: **cubos por día**, no un contador plano (un contador no se puede decrementar: el barrido TTL borra filas sin propietario)                | ✅     |
| Cuota que **madura con la edad** de la identidad (100 MB → 1 GB en 30 días) + ráfaga diaria. Anti-sybil **sin pedir identidad**: cambia el recurso barato (claves) por el caro (tiempo) | ✅     |
| Débito atómico en `POST /media` contra la sesión, reembolso si el bucket falla, barrido de cubos vencidos. `507` (techo) / `429` (ráfaga), cabeceras `x-aegis-quota-*`          | ✅     |
| **Barra de uso en Bóveda** con fecha exacta de liberación, y `GET /media/quota` devolviendo también la FORMA de la política (`maxQuota`, `rampDays`, `ttlDays`, `maxUploadBytes`) | ✅     |
| **Aviso antes de subir**: el Canal comprueba el hueco antes de cifrar, y el grabador de voz no pide el micrófono si no cabe nada. Mismo mensaje que el del relay                | ✅     |

Regla de producto que manda sobre todo lo anterior: **el texto nunca se corta** — la cuota solo
degrada la ruta de adjuntos — y al topar siempre hay una salida gratuita **con fecha**. Verificado:
relay **44/44 tests**, `tsc` limpio en web y relay, `next build` OK.

### Entre fases — Cripto y protocolo consolidados en paquetes · ✅ **HECHO** (2026-08-15)

Era el **prerrequisito del track móvil** (resta #1 de la Fase 1): la cripto vivía dentro de
`apps/web/lib/crypto`, así que el cliente móvil habría tenido que **reimplementarla**. Reimplementar
cripto no es duplicar código: es arriesgarse a derivar una clave distinta y que la misma identidad
deje de ser la misma persona al cambiar de dispositivo.

| Entregable                                                                                                                                                                                       | Estado |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `@aegis/crypto-core`: Ed25519, X25519, XChaCha20-Poly1305, AEAD por chunks, HKDF, base64url y BIP39 — puros y portables                                                                          | ✅     |
| `@aegis/protocol`: el sobre sealed-sender como **contrato de cable** (`ENVELOPE_VERSION`, sellar/abrir, verificación de prekey)                                                                  | ✅     |
| **Tres ataduras al navegador retiradas**: `crypto.subtle` (HKDF/SHA-256) → `@noble/hashes`; `btoa`/`atob` → base64url en JS puro; `dict()` del i18n → **códigos de error** con traductor inyectable | ✅     |
| `crypto.getRandomValues` concentrado en un solo módulo (`random.ts`): en RN es importar un polyfill, y si falta el fallo es explícito                                                            | ✅     |
| El **almacén** de la semilla se queda en la app (IndexedDB + Argon2id + AES-GCM): es lo único que de verdad cambia por plataforma                                                                | ✅     |

**Lo que hace segura la mudanza** (es cripto: mover no basta, hay que demostrar que no cambió nada):

- `kdf.test.ts` compara HKDF-SHA256 y SHA-256 de `@noble/hashes` **contra Web Crypto**, con las
  mismas llamadas que hacen la derivación X25519, la clave del sobre y la huella de 16 letras.
- `bytes.test.ts` compara base64url **contra `btoa`/`atob`** en todas las longitudes de resto.
- `envelope.test.ts` guarda un **vector congelado**: un sobre sellado por la implementación
  ANTERIOR, que el paquete tiene que seguir abriendo. Es también el vector que el móvil deberá
  satisfacer.

Verificado: **crypto-core 38/38**, **protocol 8/8**, transport 15/15, relay 44/44, `tsc` limpio en
todo el monorepo y `next build` OK (con el wordlist BIP39 todavía en su chunk perezoso, no en el
paquete compartido de todas las páginas).

### Track paralelo — `apps/mobile` (React Native / Expo) · **4 sd**

No es una fase suelta: es el cliente donde de verdad viven el audio de campo y el mesh (BLE no es viable en web). Paridad de mensajería con la web. Claude reaprovecha mucha lógica y UI ya escritas para web. Conviene arrancarlo durante las Fases 3–4 para llegar listo a la Fase 5.

**Prerrequisito ya resuelto:** la cripto y el sobre son paquetes compartidos (sección anterior), así
que el móvil los consume en vez de reimplementarlos. Lo que le queda propio: el almacén de la
semilla en el keychain del sistema, el polyfill del CSPRNG y su propio traductor de errores.

**Tres cabos que aparecieron al revisar el código (2026-08-16), no estaban aquí:**

- **Expo Go no sirve.** BLE (y el keychain) necesitan módulos nativos: es prebuild + dev client con
  config plugins desde el primer día. Condiciona cómo se arranca el proyecto, no cómo se termina.
- **El SSE no se porta tal cual.** `openMessageStream` usa `fetch` con streaming a propósito
  (EventSource no puede mandar la cabecera de sesión) y el `fetch` de React Native no hace
  streaming. En móvil: `expo/fetch`, una librería de SSE, o el polling que ya existe de respaldo.
- **`crypto.randomUUID`** (el `mid` de cada mensaje saliente) tampoco existe en RN sin polyfill —
  el mismo cuidado que ya está anotado para `crypto.getRandomValues`.

### Fase 5 — Modo C: mesh local (BLE / Wi-Fi Aware) · **6 sd** · _la más difícil de comprimir_

Reutiliza el protocolo de mesh de emergencia. Requiere el cliente móvil nativo (track anterior). El testeo multi-dispositivo BLE es intrínsecamente humano y lento.

**Decisiones de diseño fijadas (2026-08-16)** en `docs/aegis-modo-c-mesh-ble.md`: roles BLE duales,
fragmentación del sobre (297–573 bytes medidos contra ~170 útiles por notificación → 2–4 fragmentos),
flooding con TTL 5 + caché de vistos, difusión a todos porque el sealed-sender no dice a quién va, y
**nunca la clave pública en el anuncio BLE** (sería una baliza de seguimiento físico).

| Prerrequisito | Estado |
| --- | --- |
| **Alta de contacto SIN relay** — QR autosuficiente con prekey + firma (`aegis://contact/v1?…&x=&s=`) | ✅ 2026-08-16 |
| Sellar para un contacto ya añadido sin red (prekey verificada en local) | ✅ (ya estaba) |
| **`id` del sobre derivado del CONTENIDO** (`SHA-256(blob)`) en todos los modos — hoy el relay usa un UUID de fila y `chat.ts::classifyEnvelope` identifica el mensaje por `env.id`. Con el puente malla→relay, el mismo sobre llegaría por dos vías con dos ids y **saldría duplicado** | ⬜ bloquea el puente |
| Cliente nativo `apps/mobile` | ⬜ |

### Fase 6 — Archivos genéricos · **1 sd**

Mismo pipeline de chunking, solo cambia el MIME type. Barato porque la tubería ya existe desde la Fase 1.

### Fase 7 — Reproducible builds + auditoría externa · **2 sd** (+ auditoría de terceros, aparte)

Dockerfile determinista, hash publicado por release, instrucciones de reproducción. Luego, contratar y acompañar la auditoría externa.
**Hito → M3 (v1 auditable). Solo aquí `AUDIT_PASSED` puede dejar de ser "pendiente".**

---

## Resumen y cronograma (1 dev + Claude)

| Fase                                                                                     | Estimación    | Acumulado |
| ---------------------------------------------------------------------------------------- | ------------- | --------- |
| 0 · Base + capa visual del cliente                                                       | hecha         | —         |
| — · Backend de acceso + transporte `.onion` (Fase 2.5 completa + parte de la 1)          | hecho (~4 sd) | —         |
| 1 · MVP relay — **texto + archivos + audio + QR + BIP39 + push tiempo real E2E ✅ (M1)** | ✅ hecha      | —         |
| 2 · Abstracción transporte                                                               | ✅ hecha      | 4,5 sd    |
| 2.5 · `.onion`                                                                           | ✅ hecha      | 4,5 sd    |
| 3 · libp2p (Modo B validado en red real)                                                 | ✅ hecha      | 4,5 sd    |
| 4 · Failover + UI                                                                        | ✅ hecha      | 4,5 sd    |
| — · Móvil (track paralelo)                                                               | 4 sd          | 8,5 sd    |
| 5 · Mesh (BLE / Wi-Fi Aware)                                                             | 6 sd          | 14,5 sd   |
| 6 · Archivos                                                                             | 1 sd          | 15,5 sd   |
| 7 · Reproducible + audit                                                                 | 2 sd          | 17,5 sd   |

**Total ingeniería restante: ~17,5 sd ≈ 4,3 meses** (–11,5 sd respecto a los 29 previos: la Fase 2.5
`.onion`, ~4 sd de acceso/relay, el **texto E2E** de la Fase 1, la **Fase 3 (Modo B)** y ahora la
**Fase 4 (failover automático + indicador)** ya están entregados). Referencia: sigue
entre el escenario ideal de 2 devs y el de 1 dev sin asistencia — Claude tira hacia el lado
rápido, pero el único humano y las fases de investigación (la 3, ya cerrada, y la 5) mantienen el suelo.

### Milestones (en semanas relativas desde ahora)

- **M1 — MVP privado** (fin Fase 1): **✅ alcanzado en código**. Texto, archivos y audio se intercambian cifrados E2E entre identidades verificadas (pendiente solo prueba manual del micro en navegador). El **acceso** y el **`.onion`** ya están. Resta pulido (QR, BullMQ, backup).
- **M2 — Beta resistente a censura** (fin Fase 4): **alcanzado en código**. Relay + `.onion` (✅) + **P2P validado en red real (✅ Fase 3)** + **failover automático con umbrales e indicador de estado (✅ Fase 4)**. Resta **trabajo humano**: desplegar el coturn ya empaquetado (`docs/aegis-coturn-deploy.md`) y la prueba NAT-a-NAT entre dos redes distintas.
- **M3 — v1 auditable** (fin Fase 7): **~17,5 sd ≈ 4,3 meses** de ingeniería, **+4–8 semanas** de calendario para la auditoría externa (tercero, en paralelo al cierre).

> La Fase 5 (mesh) es ya la que más puede mover el total: es investigación, no
> ingeniería resuelta, y es justamente la que menos se comprime con asistencia
> (la Fase 3, el otro frente de investigación, quedó cerrada el 2026-07-23).
> Si el calendario aprieta, el camino más corto a algo usable y defendible es
> cerrar M1 (relay E2E) y M2 (anti-censura) antes de abrir el frente del mesh.
