/**
 * `P2pNode` real sobre js-libp2p (Modo B / Fase 3). Implementa la interfaz que espera
 * `@aegis/transport::createP2pTransport` — start/stop/send/onEnvelope/isReady — encapsulando TODA
 * la complejidad de libp2p (transportes, NAT traversal, cifrado de enlace) aquí dentro.
 *
 * Decisión D1 (docs/aegis-fase3-libp2p-spike.md): transportes de NAVEGADOR — WebSockets (dial al
 * nodo bootstrap/relay), WebRTC (P2P navegador↔navegador con NAT traversal por ICE) y circuit-relay
 * v2 (reserva de circuito = canal de señalización del WebRTC). Noise cifra el enlace (atado a la
 * MISMA identidad Ed25519, ARQUITECTURA.md §2.5: el PeerID se deriva de la semilla, no hay segunda
 * identidad), yamux multiplexa.
 *
 * SOLO NAVEGADOR: libp2p usa el WebRTC nativo y APIs del navegador. Este módulo se importa de forma
 * DINÁMICA desde el cliente (nunca en SSR).
 *
 * Alcance del spike: mueve SOBRES OPACOS (ya cifrados E2E por el cliente). No sella, no descifra.
 * El store-and-forward para destinatarios offline (D3) NO está aquí todavía: hoy `send` es entrega
 * directa y lanza si el peer es inalcanzable (→ el failover del transporte prueba el relay).
 */
import { createLibp2p, type Libp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { bootstrap } from "@libp2p/bootstrap";
import { generateKeyPairFromSeed } from "@libp2p/crypto/keys";
import { peerIdFromString } from "@libp2p/peer-id";
import type { Stream } from "@libp2p/interface";
import { concat as concatBytes } from "uint8arrays/concat";
import type { P2pNode, WireEnvelope } from "@aegis/transport";

/**
 * Protocolo de aplicación: UN sobre opaco por stream. El emisor abre un stream, manda el blob y lo
 * cierra; el receptor concatena lo recibido hasta el cierre. (Sin marco de longitud: un stream =
 * un sobre; libp2p 3.x da un MessageStream basado en `send()` + iteración asíncrona.)
 */
const AEGIS_MSG_PROTOCOL = "/aegis/msg/1.0.0";

export interface Libp2pNodeOptions {
  /**
   * Multiaddrs del/los nodo(s) bootstrap + relay de circuito (D2). Con `/p2p/<PeerID>` al final.
   * Sin al menos uno, un navegador no tiene punto de entrada a la red ni forma de recibir WebRTC.
   */
  bootstrapMultiaddrs: string[];
}

/** Hash SHA-256 → base64url, id determinista del sobre (dos entregas del MISMO blob deduplican). */
async function blobId(blob: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", blob as unknown as BufferSource));
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Construye un `P2pNode` libp2p a partir de la semilla Ed25519 de la identidad. No arranca la red
 * hasta que el transporte llama a `start()`.
 */
export async function createLibp2pNode(
  seed: Uint8Array,
  opts: Libp2pNodeOptions,
): Promise<P2pNode> {
  // PeerID = misma identidad Ed25519 (semilla de 32 bytes → par de claves libp2p).
  const privateKey = await generateKeyPairFromSeed("Ed25519", seed);

  let node: Libp2p | null = null;
  let recvSeq = 0; // orden local de recepción (P2P no tiene cursor global del servidor)
  const listeners = new Set<(env: WireEnvelope) => void>();

  /** Lee un sobre completo de un stream entrante (hasta el cierre) y lo entrega a los listeners. */
  async function handleIncoming(stream: Stream): Promise<void> {
    const parts: Uint8Array[] = [];
    // Stream (MessageStream) es AsyncIterable<Uint8Array | Uint8ArrayList>: se itera hasta el cierre.
    for await (const chunk of stream) {
      parts.push(chunk instanceof Uint8Array ? chunk : chunk.subarray());
    }
    const blob = concatBytes(parts);
    recvSeq += 1;
    const cursor = String(recvSeq).padStart(12, "0");
    const env: WireEnvelope = { id: await blobId(blob), blob, cursor };
    for (const cb of listeners) {
      try {
        cb(env);
      } catch {
        /* un listener defectuoso no debe romper la entrega al resto */
      }
    }
  }

  return {
    async start() {
      if (node) return; // idempotente
      node = await createLibp2p({
        privateKey,
        addresses: {
          // /p2p-circuit: aceptar entrantes vía relay. /webrtc: conexiones directas P2P.
          listen: ["/p2p-circuit", "/webrtc"],
        },
        transports: [webSockets(), webRTC(), circuitRelayTransport()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        // El navegador dial-a multiaddrs de circuito/WebRTC que un gater estricto rechazaría.
        connectionGater: { denyDialMultiaddr: async () => false },
        peerDiscovery:
          opts.bootstrapMultiaddrs.length > 0
            ? [bootstrap({ list: opts.bootstrapMultiaddrs })]
            : [],
        services: { identify: identify() },
      });
      // Registra el protocolo de mensajes: cada stream entrante trae un sobre opaco.
      await node.handle(AEGIS_MSG_PROTOCOL, (stream) => {
        void handleIncoming(stream);
      });
    },

    async stop() {
      if (!node) return; // idempotente
      const n = node;
      node = null;
      await n.stop();
    },

    async send(peerId, blob) {
      if (!node) throw new Error("Nodo P2P no arrancado.");
      // Lanza si no hay ruta al peer (sin conexión, NAT sin traversal): el failover probará el relay.
      const stream = await node.dialProtocol(peerIdFromString(peerId), AEGIS_MSG_PROTOCOL);
      stream.send(blob); // un stream = un sobre
      await stream.close(); // cierra (y descarga) tras enviar el blob
    },

    onEnvelope(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    isReady() {
      // Listo si el nodo está arrancado y tiene al menos una conexión (bootstrap/relay alcanzado).
      return node !== null && node.status === "started" && node.getConnections().length > 0;
    },
  };
}
