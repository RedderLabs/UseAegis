// Verificación de firmas Ed25519 con el módulo `crypto` nativo de Node — sin librerías
// externas (coherente con la elección "cero magia, 100% auditable" del stack de datos).
//
// Node expone Ed25519 vía KeyObject, pero solo acepta claves en formato DER (SPKI/PKCS8),
// no los 32 bytes crudos que maneja el protocolo. Envolvemos la clave pública cruda con
// la cabecera SPKI fija de Ed25519 (RFC 8410) y la importamos como KeyObject.
import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as cryptoVerify,
} from "node:crypto";

export const PUBLIC_KEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;

// Cabecera DER SPKI de una clave pública Ed25519 (12 bytes):
//   30 2a          SEQUENCE (42 bytes)
//     30 05        SEQUENCE (AlgorithmIdentifier)
//       06 03 2b 65 70   OID 1.3.101.112 (Ed25519)
//     03 21 00     BIT STRING (33 bytes, 0 unused) → seguido de los 32 bytes de la clave
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Envuelve una clave pública Ed25519 cruda (32 bytes) en un KeyObject de Node. */
function toPublicKeyObject(publicKey: Buffer) {
  const der = Buffer.concat([SPKI_ED25519_PREFIX, publicKey]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

/**
 * Verifica que `signature` es una firma Ed25519 válida de `message` hecha con la clave
 * privada correspondiente a `publicKey`. Devuelve false ante cualquier entrada malformada
 * en vez de lanzar, para no filtrar la causa del fallo al cliente.
 */
export function verifySignature(
  publicKey: Buffer,
  message: Buffer,
  signature: Buffer,
): boolean {
  if (publicKey.length !== PUBLIC_KEY_BYTES) return false;
  if (signature.length !== SIGNATURE_BYTES) return false;
  try {
    // Para Ed25519 el algoritmo de hash es null: se firma el mensaje completo.
    return cryptoVerify(null, message, toPublicKeyObject(publicKey), signature);
  } catch {
    return false;
  }
}

/** Genera `n` bytes criptográficamente aleatorios (nonces de challenge, tokens de sesión). */
export function randomToken(n = 32): Buffer {
  return randomBytes(n);
}

/** SHA-256 de un token; guardamos solo el hash, nunca el token en claro. */
export function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

/** Comparación en tiempo constante de dos buffers de igual longitud. */
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- Codificación base64url para transportar bytes por JSON --------------------------

export function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/** Decodifica base64url a Buffer; devuelve null si no es base64url válido. */
export function fromBase64Url(value: string): Buffer | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

/** Decodifica y valida una clave pública Ed25519 (32 bytes) en base64url. */
export function decodePublicKey(value: string): Buffer | null {
  const bytes = fromBase64Url(value);
  if (!bytes || bytes.length !== PUBLIC_KEY_BYTES) return null;
  return bytes;
}

/** Decodifica y valida una firma Ed25519 (64 bytes) en base64url. */
export function decodeSignature(value: string): Buffer | null {
  const bytes = fromBase64Url(value);
  if (!bytes || bytes.length !== SIGNATURE_BYTES) return null;
  return bytes;
}
