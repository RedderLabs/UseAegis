/**
 * Modo B — transporte P2P vía libp2p (docs/ARQUITECTURA.md §5). ANDAMIAJE de la Fase 3.
 *
 * Entrega sobres opacos DIRECTAMENTE a un peer, sin pasar por el buzón del relay. Es la puerta
 * resistente a censura: entra por failover cuando el Modo A (relay) no es alcanzable.
 *
 * Igual que `createRelayTransport`, este módulo NO conoce `apps/web` NI `libp2p`: recibe el nodo
 * P2P por INYECCIÓN de dependencias (`P2pNode`). Así:
 *   - la web lo cablea con un nodo `js-libp2p` real (WebRTC/WebTransport en el navegador),
 *   - los tests lo cablean con un nodo falso en memoria (sin red, deterministas),
 * y el contrato `Transport` queda idéntico al del relay: se añade a la lista de
 * `createFailoverTransport([...])` sin tocar al cliente de chat.
 *
 * IMPORTANTE (alcance del spike): aquí NO vive la cripto de contenido (sigue siendo sealed-sender
 * en el cliente) ni la lógica de libp2p (DHT/Kademlia, circuit relay v2, Noise, GossipSub): eso lo
 * encapsula el `P2pNode` que se inyecte. Este módulo solo adapta ese nodo al contrato `Transport`.
 * El PeerID se deriva de la MISMA clave Ed25519 de la identidad (ARQUITECTURA.md §2.5): el nodo
 * inyectado se construye con esa semilla, no hay una "segunda identidad" para el modo P2P.
 */
import type { MessageHandler, Transport, WireEnvelope } from "./types";

/**
 * Nodo P2P que el transporte necesita, abstraído de la implementación concreta (libp2p real o
 * un doble en memoria). Encapsula el descubrimiento, el NAT traversal y el cifrado de enlace: el
 * transporte solo pide "arranca", "manda estos bytes a este PeerID" y "avísame de los entrantes".
 */
export interface P2pNode {
  /** Arranca el nodo: escucha, se conecta al bootstrap y empieza a descubrir peers. Idempotente. */
  start(): Promise<void>;

  /** Para el nodo y cierra conexiones. Idempotente. */
  stop(): Promise<void>;

  /**
   * Entrega `blob` al peer `peerId` por conexión directa (dial + stream). Lanza si no se puede
   * alcanzar al peer (sin ruta, offline, NAT sin traversal) — así el failover prueba otro modo.
   * Si el destinatario está offline, el `P2pNode` decide su política de store-and-forward
   * (GossipSub, o rebote al relay): eso queda ENCAPSULADO aquí, no en el transporte.
   */
  send(peerId: string, blob: Uint8Array): Promise<void>;

  /**
   * Registra un callback de sobres entrantes. Devuelve una función para darse de baja. El nodo
   * entrega `WireEnvelope`s ya reensamblados (mismo formato que el relay: `id` + `blob` + `cursor`).
   */
  onEnvelope(cb: (env: WireEnvelope) => void): () => void;

  /**
   * ¿Hay al menos una vía P2P utilizable ahora mismo? (nodo arrancado y con alguna conexión o
   * ruta viable). Lo consulta `isAvailable()` para que el failover decida si vale la pena intentar
   * el Modo B antes de mandar por él.
   */
  isReady(): boolean;
}

export interface P2pTransportOptions {
  /** El nodo P2P (libp2p real en la web, doble en memoria en tests). */
  node: P2pNode;
}

/**
 * Crea un transporte Modo B (P2P/libp2p) a partir de un `P2pNode` inyectado. Adapta el nodo al
 * contrato `Transport` común; toda la complejidad de red vive DENTRO del nodo.
 */
export function createP2pTransport(opts: P2pTransportOptions): Transport {
  const { node } = opts;

  const handlers = new Set<MessageHandler>();
  let started = false;
  let offNode: (() => void) | null = null;

  /** Reparte un sobre entrante a todos los handlers; un handler defectuoso no corta a los demás. */
  function dispatch(env: WireEnvelope): void {
    for (const handler of handlers) {
      try {
        void handler(env);
      } catch {
        /* un handler defectuoso no debe romper la entrega al resto */
      }
    }
  }

  return {
    activeMode: "p2p",

    async isAvailable() {
      // Disponible solo si el nodo está arrancado Y tiene alguna vía P2P viable ahora mismo.
      return started && node.isReady();
    },

    send(peerId, blob) {
      // Lanza hacia arriba si el nodo no puede entregar: el failover probará el siguiente modo.
      return node.send(peerId, blob);
    },

    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    start() {
      if (started) return; // idempotente
      started = true;
      // Suscribe la entrada ANTES de arrancar, para no perder sobres que lleguen al conectar.
      offNode = node.onEnvelope(dispatch);
      // Arranque asíncrono del nodo (dial al bootstrap, descubrimiento): no bloquea a `start()`.
      // Si falla, el transporte queda no-disponible (`isReady()` = false) y el failover lo salta.
      void node.start().catch(() => {
        /* nodo no pudo arrancar: isAvailable() devolverá false y el failover usará otro modo */
      });
    },

    stop() {
      if (!started) return; // idempotente
      started = false;
      if (offNode) {
        offNode();
        offNode = null;
      }
      void node.stop().catch(() => {
        /* cierre best-effort: nada que reintentar */
      });
    },
  };
}
