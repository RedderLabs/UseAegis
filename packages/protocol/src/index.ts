/**
 * @aegis/protocol
 *
 * Formato de mensaje y versión de protocolo, común a los tres transportes.
 * Placeholder de la fase 1 del roadmap (docs/ARQUITECTURA.md §9).
 */

export const PROTOCOL_VERSION = 1;

export type MessageKind = "text" | "audio" | "file";

export interface EnvelopeMeta {
  version: number;
  kind: MessageKind;
}

export const PROTOCOL_READY = false;
