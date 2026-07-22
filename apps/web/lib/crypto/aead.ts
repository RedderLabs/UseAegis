/**
 * Cifrado autenticado del CONTENIDO de un mensaje: XChaCha20-Poly1305 (AEAD) + HKDF-SHA256.
 *
 * XChaCha20-Poly1305 lo aporta `@noble/ciphers` (auditado); no implementamos primitivos propios
 * (docs/PLANTILLA.md §5). El nonce es de 24 bytes (XChaCha) → aleatorio por mensaje sin riesgo de
 * colisión práctico. La clave de sesión se DERIVA del secreto ECDH X25519 por HKDF-SHA256, para no
 * usar el material crudo del ECDH como clave simétrica (higiene criptográfica).
 *
 * ⚠️ Código criptográfico — pendiente de REVISIÓN HUMANA (docs/PLANTILLA.md §5).
 * Solo se ejecuta en navegador/Node con Web Crypto (HKDF) + `@noble/ciphers` (AEAD).
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha";

export const AEAD_KEY_BYTES = 32;
export const AEAD_NONCE_BYTES = 24; // XChaCha20

/** Deriva una clave AEAD de 32 bytes desde un secreto compartido (ECDH) por HKDF-SHA256. */
export async function deriveAeadKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    sharedSecret as unknown as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      info: info as unknown as BufferSource,
    },
    ikm,
    AEAD_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Nonce XChaCha20 aleatorio (24 bytes) del CSPRNG del sistema. */
export function randomNonce(): Uint8Array {
  const nonce = new Uint8Array(AEAD_NONCE_BYTES);
  crypto.getRandomValues(nonce);
  return nonce;
}

/** Cifra `plaintext` con `key`/`nonce`, ligando `aad` (datos autenticados no cifrados). */
export function aeadEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
}

/** Descifra y VERIFICA `ciphertext`. Lanza si la etiqueta Poly1305 o el `aad` no cuadran. */
export function aeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
}
