# Fase 3 — Spike libp2p (Modo B) · documento de diseño

> Estado: **CERRADA** (2026-07-23). D1–D4 fijadas, `P2pNode` real sobre js-libp2p, bootstrap
> desplegado en prod y **criterio de éxito §1.1 validado en red real**: dos navegadores clearnet con
> el relay apagado movieron un sobre E2E por P2P. `IMPLEMENTED_MODES` = `["relay","p2p"]`. Queda
> como endurecimiento de Fase 4 la **NAT-a-NAT entre redes distintas** (posible TURN).
> Ver `docs/ARQUITECTURA.md §5` y `docs/ROADMAP.md`.

## 1. Objetivo del spike

Validar lo **incierto** con lo mínimo, no entregar el Modo B pulido. "Hecho" =

1. **Éxito mínimo:** dos navegadores (dos identidades verificadas) se descubren por PeerID y se
   envían un sobre E2E **directo P2P**, con el **relay apagado**, y aparece en el Canal del otro.
2. **Failover real:** con `createFailoverTransport([relay, p2p])`, matar el relay a media
   conversación y ver que **A→B** conmuta y el mensaje llega igual.
3. **Veredicto de store-and-forward:** decisión documentada — GossipSub viable, o el relay sigue de
   ancla para destinatarios offline. No prometer lo que la red no da.
4. **Nodo con rol nuevo:** bootstrap / circuit-relay v2 desplegado junto a lo que ya hay.

Fuera de alcance (Fase 4): indicador verde/ámbar/rojo del header y failover con umbrales afinados.

## 2. Lo que YA está hecho (paso 2 del plan)

- **`packages/transport/src/p2p.ts`** — `createP2pTransport({ node })` implementa el contrato
  `Transport` (`activeMode: "p2p"`, `send/onMessage/start/stop/isAvailable`). Toda la complejidad de
  red vive DENTRO de un `P2pNode` **inyectado** (mismo patrón que `RelayBackend` en `relay.ts`), de
  modo que el módulo es testeable sin libp2p y sin red.
- **`P2pNode`** (interfaz): `start/stop/send(peerId,blob)/onEnvelope/isReady`. El `send` **lanza** si
  el peer es inalcanzable → dispara el failover. La política de destinatario offline queda
  **encapsulada** dentro del nodo, no en el transporte.
- **Tests** (`transport.test.ts`, 11/11): entrega directa peer→peer, `isAvailable` ligado al nodo,
  idempotencia de start/stop, `send` a peer inalcanzable lanza, y **failover A→B con relay caído**.
- **Export** desde `@aegis/transport`. `IMPLEMENTED_MODES` sigue siendo `["relay"]`: el adaptador
  existe, pero `p2p` no se anuncia como modo real hasta que el `P2pNode` con libp2p esté vivo.

## 3. Decisiones de diseño — **pendientes de fijar** (son tuyas)

> Estas cambian el resto del spike. Marco mi recomendación, pero decides tú.

### D1 — Transportes de libp2p en navegador · ✅ **DECIDIDO** (2026-07-22)
El cliente es web (`apps/web`) ⇒ **no hay TCP/QUIC crudos**. Stack elegido (verificado contra la
guía oficial `libp2p.io/docs/webrtc-browser-connectivity`, API js-libp2p 2.x):

| Capa | Módulo | Papel |
|---|---|---|
| Transporte | `@libp2p/websockets` | dial al nodo bootstrap/relay (WSS) |
| Transporte | `@libp2p/webrtc` | P2P navegador↔navegador (NAT traversal por ICE) |
| Transporte | `@libp2p/circuit-relay-v2` | reserva de circuito = **canal de señalización** del WebRTC |
| Cifrado enlace | `@chainsafe/libp2p-noise` | Noise, atado a la Ed25519 de la identidad |
| Muxer | `@chainsafe/libp2p-yamux` | multiplexa streams (requerido incluso para WS sobre el circuito) |
| Servicio | `@libp2p/identify` | intercambio de capacidades/observed-addr |
| Descubrimiento | `@libp2p/bootstrap` + `@libp2p/pubsub-peer-discovery` | entrada a la red + anuncio |
| Pubsub | `@chainsafe/libp2p-gossipsub` | base para store-and-forward (ver D3) |
| Clave | `@libp2p/crypto` | PeerID desde la semilla Ed25519 (`generateKeyPairFromSeed`) |

- `addresses.listen`: `/p2p-circuit` (para aceptar entrantes vía relay) y `/webrtc`.
- **WebTransport** queda opcional (extra si el navegador lo trae); no bloquea el spike.
- **Riesgo de bundling:** libp2p es browser-only ⇒ el nodo se **importa dinámicamente** (nunca en
  SSR) y puede requerir ajustes de webpack en Next 15. Se valida con `next build`.

### D2 — Rol nuevo del nodo (bootstrap + circuit-relay v2 + signalling) · ✅ **DECIDIDO** (2026-07-22)
Un peer nuevo necesita un punto de entrada a la red y, en navegador, un relay de circuito que hace
de **señalización** del WebRTC. **Decisión:** el **mismo host** que ya corre relay + `.onion` corre
también el bootstrap + circuit-relay v2 (coherente con la `.onion` colocada en Coolify, no aislada —
ver [[aegis-onion-coolify]]).

**Implementado (paso 3):**
- `infra/p2p-bootstrap/server.mjs` — nodo libp2p **solo WebSockets** (el WebRTC lo ponen los
  navegadores) con `circuitRelayServer()` + `identify`, Noise + yamux. **PeerID estable**: semilla de
  32 bytes persistida en volumen (o inyectada por `P2P_BOOTSTRAP_SEED`) → el multiaddr de bootstrap
  no cambia entre reinicios. Imprime PeerID + multiaddr al arrancar.
- `infra/p2p-bootstrap/{package.json,Dockerfile}` — imagen `node:22-alpine`, sin build nativo
  (WS-only ⇒ **no** necesita `node-datachannel`), corre como usuario `node`.
- `docker-compose.yml` — servicio `aegis-p2p-bootstrap` (perfil `node`, puerto 9001, volumen
  `aegis-p2p-bootstrap-data`). `docker compose --profile node config` valida.
- **Cableado de build hecho (2026-07-23):** `NEXT_PUBLIC_P2P_BOOTSTRAP` viaja ahora como **build
  arg** del servicio web en AMBOS composes (`docker-compose.yml` y `docker-compose.coolify.yml`) y se
  declara en `apps/web/Dockerfile` (`ARG`+`ENV`) para incrustarse en el bundle. El compose de Coolify
  incorpora el servicio `p2p-bootstrap` (volumen `aegis-p2p-bootstrap-data`, `P2P_BOOTSTRAP_SEED`
  opcional) y `.env.coolify.example` documenta el flujo. `docker compose config` valida en ambos.
- **Deploy pendiente (ejecución en el host):** asignar dominio `p2p.useaegis.app` al servicio
  `p2p-bootstrap` (Traefik termina `wss`) + DNS A, sacar el PeerID de los logs, rellenar
  `NEXT_PUBLIC_P2P_BOOTSTRAP` con el multiaddr y **redeployar la web**.

### D3 — Store-and-forward (el punto frágil) · ✅ **DECIDIDO** (2026-07-22)
GossipSub con caché en "peers voluntarios" **no garantiza** entrega a offline. **Decisión: (a) el
relay sigue siendo el ANCLA de store-and-forward, también en Modo B. NO se implementa GossipSub.**

**Por qué:** el Modo B resuelve **alcanzabilidad** — que TÚ puedas mandar cuando el relay está
bloqueado *para ti* — no la persistencia para un **destinatario offline**. Meter GossipSub añadiría
una capa frágil (entrega no garantizada, superficie de red y de abuso) para un beneficio que el
buzón del relay ya da de forma fiable siempre que el relay sea alcanzable por *alguien*.

**Cómo lo realiza la arquitectura que ya existe (sin código nuevo):**
- El `P2pNode` hace **entrega directa**: `send()` lanza si el peer es inalcanzable.
- El failover `createFailoverTransport([relay, p2p])` prueba **relay primero**; si el relay
  responde, él almacena el sobre (buzón sealed-sender + TTL) y cubre al destinatario offline. Solo
  cuando el relay está **bloqueado** se cae a P2P directo.
- Consecuencia (límite honesto, documentado): **relay bloqueado _para ti_ + destinatario offline al
  mismo tiempo ⇒ no hay store-and-forward**; el sobre se entrega cuando una de las dos puertas
  vuelve. Es un compromiso consciente del MVP anti-censura, no un olvido.

**Limpieza aplicada:** se retiran de `apps/web` las deps `@chainsafe/libp2p-gossipsub` y
`@libp2p/pubsub-peer-discovery` (instaladas al explorar D1, ya no se usan). El descubrimiento va por
`bootstrap` (D2), no por pubsub.

### D4 — Descubrimiento (DHT Kademlia) · ✅ **DECIDIDO** (2026-07-22)
**Decisión: sin Kademlia en el spike ni el MVP.** El descubrimiento se resuelve en dos mitades:

1. **PeerID → gratis, sin lookup.** El PeerID de libp2p se DERIVA de la clave pública Ed25519 del
   contacto, que ya tienes (contactos / directorio de prekeys). `apps/web/lib/p2p/peer-id.ts::`
   `libp2pPeerIdFromEd25519(pubkey)` lo calcula. **Verificado en runtime**: coincide byte a byte con
   el PeerID que anuncia el nodo del destinatario (misma semilla).
2. **PeerID → ruta, por circuito conocido.** Sin DHT, `P2pNode.send()` disca a través del CIRCUITO
   de cada bootstrap conocido: `/<bootstrap>/p2p-circuit/webrtc/p2p/<target>` (relayado + upgrade a
   WebRTC directo). Basta con conocer el bootstrap (config) y el PeerID (derivado).

**Por qué aplazar Kademlia:** solo hace falta cuando hay MUCHOS relays y el descubrimiento debe ser
descentralizado. Para el spike (peers sobre un bootstrap conocido) y el MVP, añade complejidad de
cliente-DHT en navegador sin beneficio. Entra en una fase de escala posterior.

## 3.5. Despliegue en Coolify (el bootstrap detrás de Caddy)

Coolify despliega el `docker-compose.yml` (perfil `node`) en el host único (ver [[aegis-onion-coolify]]).
El servicio `aegis-p2p-bootstrap` entra con el resto. Puntos clave:

- **WSS obligatorio para navegadores.** Una página https no puede abrir `ws://` inseguro → el
  navegador necesita `wss`. Caddy ya es el reverse proxy: se añadió un bloque `P2P_DOMAIN` que
  termina TLS y hace `wss → aegis-p2p-bootstrap:9001` (upgrade WebSocket automático).
- **Producción:** en el `.env` de Coolify, `P2P_DOMAIN=p2p.aegis.app` + `P2P_TLS=admin@aegis.app`
  (Let's Encrypt), y un registro **DNS A** `p2p.aegis.app → IP pública`. El multiaddr para el cliente
  es `/dns4/p2p.aegis.app/tcp/443/wss/p2p/<PeerID>` → va en `NEXT_PUBLIC_P2P_BOOTSTRAP`.
- **PeerID estable:** lo imprime `docker compose --profile node logs aegis-p2p-bootstrap` al
  arrancar (semilla persistida en el volumen `aegis-p2p-bootstrap-data`; o fíjalo con
  `P2P_BOOTSTRAP_SEED`). Cópialo una vez al multiaddr y reconstruye `aegis-web`.
- **WebRTC NO viaja por Tor**, pero el Modo B **sí** — reenviado por el circuito (ver §3.6). Por la
  puerta clearnet: WebRTC directo. Por la `.onion`: el sobre se reenvía por el circuit-relay (TCP).
- **Gotcha de firewall** (heredado): si endureces con ufw default-deny, deja pasar el 443 y el
  self-SSH de Coolify (172.16/12 y 10/8), o los deploys se rompen (ver [[aegis-antidos-hardening]]).

## 3.6. Modo B por la `.onion` (Tor) — reenviado por circuito · ⚠️ IMPLEMENTADO, pendiente validar en deploy

El aprendizaje del paso 5 (§5) —"el P2P no funciona desde Tor"— **no era asumible**: el requisito es
que el Modo B funcione **indistintamente por `.app` y por `.onion`**. Lo bloqueaba un límite físico
del navegador, no un bug: **WebRTC = UDP + ICE**, y Tor solo transporta **TCP** (además el Navegador
Tor bloquea WebRTC anti-fuga de IP). Cero UDP sobre Tor.

**Lo que un navegador SÍ puede sobre Tor:** WebSockets (TCP) contra el circuit-relay, llevando el
stream `/aegis/msg` **por el propio circuito** (sin upgrade a WebRTC). Cambios (2026-07-25):

- **`infra/p2p-bootstrap/server.mjs`** — `circuitRelayServer({ maxReservations: 512, applyDefaultLimit:
  false })`: el relay **reenvía datos reales**, no solo señaliza (los límites de *limited relay* por
  defecto cortarían un chat a los pocos KB/s). Sigue viendo **bytes opacos** (E2E intacto).
- **`infra/tor/torrc.coolify`** — el WS del circuit-relay se sirve como **puerto virtual 9001 sobre la
  MISMA onion de la web** (`HiddenServicePort 9001 p2p-bootstrap:9001`). Un WebSocket = **un** stream
  Tor (yamux multiplexa dentro) → el `MaxStreams` no lo estrangula. `entrypoint.coolify.sh` resuelve
  `p2p-bootstrap` a IP (opcional: si no está, elimina la línea y web/relay arrancan igual).
- **`apps/web/lib/p2p/node.ts`** — puerta `onion`: sin `webRTC()`, listen solo `/p2p-circuit`, y
  `send()` disca `/<bootstrap>/p2p-circuit/p2p/<target>` **sin `/webrtc`**. Clearnet intacto.
- **`chat.ts`** — `isOnionSession()` elige el bootstrap: `NEXT_PUBLIC_P2P_BOOTSTRAP_ONION`
  (`/dns4/<web-onion>.onion/tcp/9001/ws/p2p/<PeerID>`, `ws` plano — Tor cifra) vs `_BOOTSTRAP` (wss).

**Caveat honesto (para la auditoría):** sobre Tor el sobre lo **reenvía el circuit-relay** — es Modo B
real (mismo plano libp2p, mismo sobre E2E, **no** el buzón que *almacena* del Modo A), pero **no** P2P
directo: el relay ve **metadatos** (quién↔quién, cuándo), nunca el contenido. En un navegador, sobre
Tor, esto es **inevitable** (el navegador no puede escuchar ni hospedar un onion service). El P2P
directo-sin-relay sobre Tor queda para la **app nativa + Arti** (cada peer con su propio onion).

**Falta validar en deploy** (no lo cubre el test: gotcha `@libp2p/crypto` bajo `tsx`): redeploy de
`p2p-bootstrap`+`tor`+`web`, cablear `NEXT_PUBLIC_P2P_BOOTSTRAP_ONION`, y **dos Navegadores Tor** sobre
la `.onion` con el relay caído *para ti* → el sobre debe entregarse por P2P.

## 4. Riesgo (por qué "la más difícil de comprimir")

El problema no es el código —`js-libp2p` existe— sino **validar red real**: NAT-a-NAT entre dos
casas con routers distintos (paso 5 del plan) es donde esto funciona o se rompe, y es debugging
humano. Noise toca el enlace (nativo de libp2p, atado a tu Ed25519); cualquier cosa que roce claves
entra en revisión humana (`PLANTILLA §5`). El E2E de contenido (XChaCha20-Poly1305 + sealed-sender)
**no cambia**: el transporte solo mueve bytes opacos.

## 5. Plan de sub-pasos

1. ✅ **Decisiones de diseño** (este doc) — D1, D2, D3 y D4 fijadas.
2. ✅ **`createP2pTransport()`** contra el contrato + tests (hecho 2026-07-22).
3. ✅ **Nodo bootstrap / circuit-relay v2** en el compose (`infra/p2p-bootstrap`, perfil `node`),
   **desplegado en prod** (Coolify) y su multiaddr cableado en `NEXT_PUBLIC_P2P_BOOTSTRAP`
   (build-time). Puerta `wss://p2p.useaegis.app` verificada: 101 Switching Protocols.
4. ✅ **`P2pNode` real** con `js-libp2p` en `apps/web` (`lib/p2p/node.ts`, D1 — PeerID desde Ed25519).
5. ✅ **Conexión directa P2P** (2026-07-23): dos navegadores **clearnet** con el **relay apagado**;
   el mensaje de A apareció en el Canal de B. Los `500` de `POST /api/messages` en consola son el
   failover probando el relay muerto primero (esperados); la entrega P2P no deja rastro HTTP.
   Dos gotchas de la prueba: el P2P **no funciona desde Tor por WebRTC** (→ **resuelto** llevándolo
   por el circuito, §3.6, pendiente validar en deploy), y el **auth necesita el relay** (con el relay
   caído no se puede loguear ni recargar sin perder la sesión — decisión de diseño: la sesión se
   firma contra el relay siempre, para la auditoría; el Modo B sostiene una conversación **ya
   iniciada**). La independencia total del relay que da WebRTC solo existe en clearnet o en la app
   nativa + Arti, no en un navegador sobre Tor.
6. 🟡 **NAT real** (dos redes distintas) — *aquí vive el riesgo residual*. Lo validado en el paso 5 es
   NAT permisiva (misma red). **Fase 4 puso el mecanismo** (2026-07-30): `webRTC()` ya se construye
   con `rtcConfiguration.iceServers` desde `NEXT_PUBLIC_P2P_ICE_SERVERS` (+ `_TURN_USER` /
   `_TURN_CREDENTIAL`), así que STUN y **TURN** se enchufan sin tocar código. **Sin configurar no hay
   ICE, a propósito**: meter un STUN público de terceros por defecto le daría a ese tercero la IP de
   cada usuario que arranca el Modo B — justo lo que evita el modelo de amenaza; el STUN/TURN se
   autoaloja junto al bootstrap. **Falta la prueba humana**: levantar coturn y probar entre dos ISP
   distintas (el circuit-relay v2 da señalización, no relevo de media).
7. ✅ **Store-and-forward → veredicto** (D3): relay de ancla, sin GossipSub. Lo realiza el failover.
8. ✅ **Enganche al failover** en `apps/web/lib/chat.ts` (2026-07-22). `createChatTransport` añade
   `p2p` como SEGUNDO candidato del failover **solo si `NEXT_PUBLIC_P2P_BOOTSTRAP` está definido**
   (sin él, el chat queda idéntico: solo relay). El nodo libp2p se crea **perezosamente** al
   arrancar (`lib/p2p/lazy-node.ts`): import dinámico de `lib/p2p/node.ts` (browser-only, nunca SSR)
   con la clave libp2p que deriva `identity-store::unlockedLibp2pPrivateKey` — la semilla Ed25519 NO
   sale de `identity-store`. `node.send()` acepta la clave Ed25519 (base64url, misma moneda que el
   relay) y DERIVA el PeerID (D4). `next build` verde + 11/11 tests.
9. ✅ **Cierre** (2026-07-23): `IMPLEMENTED_MODES` → `["relay","p2p"]` tras el pase del paso 5,
   doc + ROADMAP + memoria actualizados, PR #4.
