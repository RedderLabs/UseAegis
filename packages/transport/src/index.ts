/**
 * @aegis/transport
 *
 * Interfaz única de transporte (docs/ARQUITECTURA.md §7). El resto del protocolo
 * nunca sabe por cuál de los tres modos viaja un mensaje: la selección y el
 * failover viven exclusivamente aquí.
 *
 *   send() → intenta Modo A (relay) → si falla, Modo B (libp2p) → si no hay red, Modo C (mesh)
 */

export type TransportMode = "relay" | "p2p" | "mesh";

export interface Transport {
  send(peerId: string, encryptedBlob: Uint8Array): Promise<void>;
  onMessage(handler: (blob: Uint8Array) => void): void;
  readonly activeMode: TransportMode;
}

export const TRANSPORT_READY = false;
