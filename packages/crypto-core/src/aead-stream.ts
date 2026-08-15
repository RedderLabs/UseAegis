/**
 * Cifrado autenticado por CHUNKS para adjuntos grandes (audio/archivos) — Modo A.
 *
 * El texto usa un único AEAD por mensaje (aead.ts). Para media grande se trocea el contenido y se
 * cifra cada chunk con XChaCha20-Poly1305 bajo una CLAVE ALEATORIA por adjunto (no derivada del
 * ECDH del sobre): esa clave viaja cifrada DENTRO del sobre sealed-sender (E2E al destinatario),
 * como en el modelo de adjuntos de Signal. El ciphertext resultante es opaco para el relay/bucket.
 *
 * Construcción (equivalente a un secretstream sin depender de libsodium, ver
 * docs/aegis-messaging-mvp.md §1):
 *  - Nonce de 24 B (XChaCha) = streamId(16 B aleatorio) ‖ contador(8 B BE). El streamId aleatorio
 *    hace único el nonce entre adjuntos; el contador, entre chunks del mismo adjunto.
 *  - AAD de cada chunk = flag "final" (1 B). El destinatario descifra el chunk i con isFinal =
 *    (i === último). Consecuencias de seguridad:
 *      · REORDENAR chunks → cambia el nonce esperado → la etiqueta Poly1305 falla.
 *      · TRUNCAR el final → el nuevo último chunk se cifró con isFinal=false pero se descifra con
 *        isFinal=true → la etiqueta falla (detecta el recorte).
 *      · AÑADIR chunks tras el final → el que era final se descifra con isFinal=false → falla.
 *  - Framing: header ‖ [len(4 B BE) ‖ ct]… El len permite trocear sin conocer el tamaño del claro.
 *
 * LÍMITE MVP: cifra/descifra en memoria (el adjunto entero); adecuado para el tope de 50 MiB del
 * relay. El troceo en streaming real (sin materializar todo) es endurecimiento posterior.
 *
 * ⚠️ Código criptográfico — pendiente de REVISIÓN HUMANA (docs/PLANTILLA.md §5).
 */
import { aeadDecrypt, aeadEncrypt } from "./aead";
import { cryptoError } from "./errors";
import { randomBytes } from "./random";

export const MEDIA_KEY_BYTES = 32;
export const DEFAULT_CHUNK_BYTES = 64 * 1024; // 64 KiB de claro por chunk

const STREAM_VERSION = 1;
const STREAM_ID_BYTES = 16;
const COUNTER_BYTES = 8; // 16 + 8 = 24 = nonce XChaCha20
const HEADER_BYTES = 1 + STREAM_ID_BYTES + 4; // version ‖ streamId ‖ chunkSize
const LEN_PREFIX_BYTES = 4;
const TAG_BYTES = 16; // Poly1305

/** Clave AEAD aleatoria de 32 B para un adjunto (del CSPRNG del sistema). */
export function randomMediaKey(): Uint8Array {
  return randomBytes(MEDIA_KEY_BYTES);
}

/** Nonce de 24 B = streamId(16) ‖ contador(8 BE). El contador ocupa los 32 bits bajos. */
function nonceFor(streamId: Uint8Array, counter: number): Uint8Array {
  const nonce = new Uint8Array(STREAM_ID_BYTES + COUNTER_BYTES);
  nonce.set(streamId, 0);
  new DataView(nonce.buffer).setUint32(STREAM_ID_BYTES + 4, counter >>> 0, false);
  return nonce;
}

/** AAD del chunk: 1 byte que marca si es el último (anti-truncado/anti-extensión). */
function finalAad(isFinal: boolean): Uint8Array {
  return Uint8Array.of(isFinal ? 1 : 0);
}

/**
 * Cifra `plaintext` completo por chunks con `key`. Devuelve el blob opaco (header ‖ frames) listo
 * para subir al relay. `chunkSize` = tamaño de claro por chunk (por defecto 64 KiB).
 */
export function encryptMedia(
  key: Uint8Array,
  plaintext: Uint8Array,
  chunkSize: number = DEFAULT_CHUNK_BYTES,
): Uint8Array {
  if (key.length !== MEDIA_KEY_BYTES) throw cryptoError("invalidMediaKey");
  if (chunkSize <= 0) throw cryptoError("invalidChunkSize");

  const streamId = randomBytes(STREAM_ID_BYTES);

  // Al menos 1 chunk (soporta claro vacío como un único chunk final vacío).
  const nChunks = Math.max(1, Math.ceil(plaintext.length / chunkSize));
  const frames: Uint8Array[] = [];
  let totalCt = 0;
  for (let i = 0; i < nChunks; i++) {
    const slice = plaintext.subarray(i * chunkSize, (i + 1) * chunkSize);
    const isFinal = i === nChunks - 1;
    const ct = aeadEncrypt(key, nonceFor(streamId, i), slice, finalAad(isFinal));
    const frame = new Uint8Array(LEN_PREFIX_BYTES + ct.length);
    new DataView(frame.buffer).setUint32(0, ct.length, false);
    frame.set(ct, LEN_PREFIX_BYTES);
    frames.push(frame);
    totalCt += frame.length;
  }

  const out = new Uint8Array(HEADER_BYTES + totalCt);
  out[0] = STREAM_VERSION;
  out.set(streamId, 1);
  new DataView(out.buffer).setUint32(1 + STREAM_ID_BYTES, chunkSize, false);
  let off = HEADER_BYTES;
  for (const f of frames) {
    out.set(f, off);
    off += f.length;
  }
  return out;
}

/** Descifra y VERIFICA un blob producido por `encryptMedia`. Lanza si algo no cuadra. */
export function decryptMedia(key: Uint8Array, blob: Uint8Array): Uint8Array {
  if (key.length !== MEDIA_KEY_BYTES) throw cryptoError("invalidMediaKey");
  if (blob.length < HEADER_BYTES) throw cryptoError("mediaBlobTooShort");
  const version = blob[0]!;
  if (version !== STREAM_VERSION) throw cryptoError("unsupportedMediaVersion", { version });
  const streamId = blob.slice(1, 1 + STREAM_ID_BYTES);
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

  // 1er paso: enmarcar todos los chunks (para saber cuál es el ÚLTIMO antes de descifrar,
  // porque el AAD "final" depende de ello).
  const cts: Uint8Array[] = [];
  let off = HEADER_BYTES;
  while (off < blob.length) {
    if (off + LEN_PREFIX_BYTES > blob.length) throw cryptoError("mediaFramingLen");
    const len = view.getUint32(off, false);
    off += LEN_PREFIX_BYTES;
    if (len < TAG_BYTES || off + len > blob.length) {
      throw cryptoError("mediaFramingOutOfRange");
    }
    cts.push(blob.slice(off, off + len));
    off += len;
  }
  if (cts.length === 0) throw cryptoError("mediaNoChunks");

  // 2º paso: descifrar cada chunk con su nonce (por índice) y el AAD final correcto.
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < cts.length; i++) {
    const isFinal = i === cts.length - 1;
    const pt = aeadDecrypt(key, nonceFor(streamId, i), cts[i]!, finalAad(isFinal));
    parts.push(pt);
    total += pt.length;
  }

  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
