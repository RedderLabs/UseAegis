/**
 * @aegis/protocol — el formato de lo que viaja por el cable, común a los tres transportes.
 *
 * Aquí vive el SOBRE sealed-sender: cómo se sella un mensaje para alguien, cómo se abre y cómo se
 * verifica la prekey del contacto. No cifra primitivos (eso es `@aegis/crypto-core`) ni mueve
 * bytes (eso es `@aegis/transport`): define la forma exacta que esos bytes tienen.
 *
 * Está separado de la cripto porque son dos compatibilidades distintas: `crypto-core` tiene que
 * dar las mismas CLAVES en todas las plataformas, y `protocol` tiene que dar los mismos BYTES.
 * Un cambio incompatible aquí sube `ENVELOPE_VERSION` y hay que decidir qué hacer con los sobres
 * en vuelo; un cambio en las claves ni siquiera es opción sin migrar identidades.
 */

export {
  ENVELOPE_VERSION,
  openEnvelope,
  sealEnvelope,
  verifyPeerPrekey,
  type IncomingMessage,
  type MessageKind,
  type OutgoingMessage,
} from "./envelope";

/** Versión del protocolo en su conjunto. Hoy coincide con la del sobre. */
export const PROTOCOL_VERSION = 1;
