/**
 * `P2pNode` PEREZOSO para el Modo B (Fase 3). Difiere la carga de libp2p — un bundle browser-only,
 * pesado y que NO debe entrar en SSR — hasta el primer `start()`. Así:
 *   - `createChatTransport` sigue siendo SÍNCRONO y SSR-safe (no arrastra libp2p),
 *   - libp2p y la clave libp2p derivada de la identidad solo se cargan EN EL NAVEGADOR, al arrancar
 *     la recepción, cuando el keystore ya está desbloqueado.
 *
 * Envuelve el `P2pNode` real (`lib/p2p/node.ts`) tras la MISMA interfaz `P2pNode` que espera
 * `@aegis/transport`. El adaptador `createP2pTransport` registra su `onEnvelope` ANTES de llamar a
 * `start()`; aquí se encolan esos listeners y se reenganchan al nodo real en cuanto existe, para no
 * perder sobres que lleguen al conectar.
 *
 * La clave libp2p se obtiene de `identity-store::unlockedLibp2pPrivateKey` (import dinámico de
 * libp2p dentro de ella): la semilla Ed25519 NO sale de ese módulo. Si el keystore está bloqueado,
 * la creación lanza → el transporte P2P queda no-disponible y el failover usa el relay.
 */
import type { P2pNode, WireEnvelope } from "@aegis/transport";
import { unlockedLibp2pPrivateKey } from "../crypto/identity-store";

/**
 * Crea un `P2pNode` perezoso que dial-a los `bootstrapMultiaddrs` dados (D2). El nodo libp2p real
 * no se construye hasta `start()`: import dinámico de `./node` + derivación de la clave libp2p.
 */
export function createLazyP2pNode(bootstrapMultiaddrs: string[]): P2pNode {
  let inner: P2pNode | null = null;
  let creating: Promise<P2pNode> | null = null;
  // Listeners registrados; el valor es su baja en el nodo real (null hasta que el nodo exista).
  const listeners = new Map<(env: WireEnvelope) => void, (() => void) | null>();

  /** Crea el nodo real una sola vez (dedup de llamadas concurrentes) y reengancha los listeners. */
  function ensureNode(): Promise<P2pNode> {
    if (inner) return Promise.resolve(inner);
    if (!creating) {
      creating = (async () => {
        const [{ createLibp2pNode }, privateKey] = await Promise.all([
          import("./node"),
          unlockedLibp2pPrivateKey(),
        ]);
        const node = await createLibp2pNode(privateKey, { bootstrapMultiaddrs });
        // Reengancha los listeners que se registraron antes de existir el nodo.
        for (const [cb, off] of listeners) {
          if (!off) listeners.set(cb, node.onEnvelope(cb));
        }
        inner = node;
        return node;
      })();
    }
    return creating;
  }

  return {
    async start() {
      const node = await ensureNode();
      await node.start();
    },

    async stop() {
      if (inner) await inner.stop();
    },

    async send(peerId, blob) {
      if (!inner) throw new Error("Nodo P2P no arrancado."); // → el failover prueba el relay
      return inner.send(peerId, blob);
    },

    onEnvelope(cb) {
      listeners.set(cb, inner ? inner.onEnvelope(cb) : null);
      return () => {
        listeners.get(cb)?.();
        listeners.delete(cb);
      };
    },

    isReady() {
      return inner?.isReady() ?? false;
    },
  };
}
