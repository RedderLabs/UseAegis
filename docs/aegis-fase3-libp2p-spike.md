# Fase 3 — Spike libp2p (Modo B) · documento de diseño

> Estado: **arrancada** (2026-07-22). El adaptador al contrato de transporte
> (`createP2pTransport`) ya existe y engancha con el failover; falta el `P2pNode` con libp2p real
> y las decisiones de red que se listan abajo. Ver `docs/ARQUITECTURA.md §5` y `docs/ROADMAP.md`.

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

### D2 — Rol nuevo del nodo (bootstrap + circuit-relay v2 + signalling)
Un peer nuevo necesita un punto de entrada al DHT y, en navegador, un relay de circuito / signalling
WebRTC. Tu nodo Proxmox/Coolify ya hace relay-A y `.onion`.
- **Recomendación:** que el **mismo host** haga de **bootstrap + circuit-relay v2** (servicio nuevo
  en el compose, perfil `node`). Pregunta abierta: ¿lo colocas junto al relay (como la `.onion`) o
  aislado? (ver [[aegis-antidos-hardening]] / [[aegis-onion-coolify]]).

### D3 — Store-and-forward (el punto frágil)
GossipSub con caché en "peers voluntarios" **no garantiza** entrega a offline. Dos caminos:
- (a) **Relay sigue de ancla** de store-and-forward incluso en Modo B (pragmático, honesto).
- (b) GossipSub puro (más "sin servidor", menos fiable).
- **Recomendación:** (a) para el MVP anti-censura — el Modo B resuelve **alcanzabilidad** cuando el
  relay está bloqueado *para ti*, no necesariamente cuando el **destinatario** está offline.

### D4 — Descubrimiento (DHT Kademlia)
En navegador el peer suele ser **cliente** del DHT; los nodos server (tu bootstrap) sostienen la
tabla.
- **Recomendación:** DHT con tu nodo como server + registro directo por PeerID (derivado de Ed25519,
  `ARQUITECTURA.md §2.5`). Medir tiempos de resolución reales.

## 4. Riesgo (por qué "la más difícil de comprimir")

El problema no es el código —`js-libp2p` existe— sino **validar red real**: NAT-a-NAT entre dos
casas con routers distintos (paso 5 del plan) es donde esto funciona o se rompe, y es debugging
humano. Noise toca el enlace (nativo de libp2p, atado a tu Ed25519); cualquier cosa que roce claves
entra en revisión humana (`PLANTILLA §5`). El E2E de contenido (XChaCha20-Poly1305 + sealed-sender)
**no cambia**: el transporte solo mueve bytes opacos.

## 5. Plan de sub-pasos

1. ✅ **Decisiones de diseño** (este doc) — falta que fijes D1–D4.
2. ✅ **`createP2pTransport()`** contra el contrato + tests (hecho 2026-07-22).
3. ⬜ **Nodo bootstrap / circuit-relay v2** en el compose (perfil `node`), desplegado en el host.
4. ⬜ **`P2pNode` real** con `js-libp2p` en `apps/web` (WebRTC/WebSockets, PeerID desde Ed25519).
5. ⬜ **Conexión directa P2P** dos navegadores en LAN → sobre E2E ida y vuelta.
6. ⬜ **NAT real** (dos redes distintas) — *aquí vive el riesgo*.
7. ⬜ **Store-and-forward** → veredicto (D3).
8. ⬜ **Enganche al failover** en `apps/web/lib/chat.ts`: añadir `p2p` a la lista de candidatos.
9. ⬜ **Cierre**: doc + memoria + PR.
