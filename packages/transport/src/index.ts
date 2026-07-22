/**
 * @aegis/transport
 *
 * Interfaz única de transporte (docs/ARQUITECTURA.md §7). El resto del protocolo nunca sabe por
 * cuál de los tres modos viaja un mensaje: la selección y el failover viven exclusivamente aquí.
 *
 *   send() → intenta Modo A (relay) → si falla, Modo B (libp2p) → si no hay red, Modo C (mesh)
 *
 * Estado: Modo A (relay) implementado (`createRelayTransport`). B y C son andamiaje de las
 * fases 3–5 del roadmap; se añaden a la lista de `createFailoverTransport` sin tocar a los
 * consumidores.
 */
export type {
  MessageHandler,
  Scheduler,
  Transport,
  TransportMode,
  WireEnvelope,
} from "./types";
export { defaultScheduler } from "./types";
export {
  createRelayTransport,
  type CursorStore,
  type RelayBackend,
  type RelayStream,
  type RelayTransportOptions,
} from "./relay";
export {
  createP2pTransport,
  type P2pNode,
  type P2pTransportOptions,
} from "./p2p";
export { createFailoverTransport } from "./failover";

/**
 * Modos con implementación de RED real hoy. El Modo B (p2p) tiene ya su adaptador al contrato
 * (`createP2pTransport`), pero el `P2pNode` con libp2p real es el trabajo de la Fase 3: hasta que
 * exista, `p2p` no entra en esta lista (los consumidores anuncian capacidades con ella).
 */
export const IMPLEMENTED_MODES = ["relay"] as const;
