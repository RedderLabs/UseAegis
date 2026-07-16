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
  type RelayTransportOptions,
} from "./relay";
export { createFailoverTransport } from "./failover";

/** Modos con implementación real hoy. Los consumidores pueden anunciar capacidades con esto. */
export const IMPLEMENTED_MODES = ["relay"] as const;
