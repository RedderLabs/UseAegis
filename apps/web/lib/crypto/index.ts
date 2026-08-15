/**
 * Fachada de la cripto para la web.
 *
 * La cripto de verdad ya no vive aquí: está en `@aegis/crypto-core` (primitivos) y
 * `@aegis/protocol` (el sobre), porque el cliente móvil tiene que compartirla byte a byte. En esta
 * carpeta se queda solo lo que de verdad es del navegador: `identity-store.ts` (IndexedDB) y
 * `vault.ts` (Argon2id + AES-GCM de Web Crypto).
 *
 * Este módulo existe por dos razones concretas:
 *  1. Importarlo INSTALA el traductor de errores (`../i18n/crypto-errors`), que es lo que hace que
 *     un fallo lanzado desde dentro del paquete siga saliendo en el idioma del usuario.
 *  2. Deja un solo sitio al que apuntar desde la app, para que mañana se pueda mover algo entre
 *     paquete y app sin tocar veinte imports.
 */
import "../i18n/crypto-errors";

export {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  AegisCryptoError,
  DEFAULT_CHUNK_BYTES,
  MEDIA_KEY_BYTES,
  SEED_BYTES,
  X25519_PUBLIC_BYTES,
  aeadDecrypt,
  aeadEncrypt,
  buildSignedPrekey,
  concatBytes,
  decryptMedia,
  deriveAeadKey,
  encryptMedia,
  fingerprint16,
  fromBase64Url,
  fromUtf8,
  generateSeed,
  prekeyMessage,
  publicKeyFromSeed,
  randomBytes,
  randomMediaKey,
  randomNonce,
  sharedSecretWith,
  signWithSeed,
  toBase64Url,
  utf8,
  verifyWithPublicKey,
  x25519PublicFromSeed,
  type CryptoErrorCode,
} from "@aegis/crypto-core";

export {
  ENVELOPE_VERSION,
  openEnvelope,
  sealEnvelope,
  verifyPeerPrekey,
  type IncomingMessage,
  type MessageKind,
  type OutgoingMessage,
} from "@aegis/protocol";
