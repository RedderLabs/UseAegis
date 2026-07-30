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
  FailoverStatus,
  FailoverSwitch,
  MessageHandler,
  ModeState,
  ModeStatus,
  ObservableTransport,
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
export { createFailoverTransport, type FailoverOptions } from "./failover";

/**
 * Modos con implementación de RED real y VALIDADA hoy. El Modo B (`p2p`) se validó en red real el
 * 2026-07-23: dos navegadores clearnet, con el relay APAGADO, intercambiaron un sobre E2E por P2P
 * directo (WebRTC señalizado vía el bootstrap/circuit-relay), y apareció en el Canal del otro — el
 * criterio de éxito del spike (`docs/aegis-fase3-libp2p-spike.md §1`). `mesh` (Modo C) sigue fuera
 * hasta validarlo en la Fase 5. (Los consumidores anuncian capacidades con esta lista.)
 */
export const IMPLEMENTED_MODES = ["relay", "p2p"] as const;
