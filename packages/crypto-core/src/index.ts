/**
 * @aegis/crypto-core — la cripto que la web y el móvil tienen que compartir byte a byte.
 *
 * Qué hay aquí: identidad Ed25519, derivación X25519 para el acuerdo de claves, AEAD del contenido
 * (XChaCha20-Poly1305), el cifrado por chunks de los adjuntos y la frase BIP39. Todo puro: bytes
 * entran, bytes salen. Sin IndexedDB, sin React, sin i18n, sin `fetch`.
 *
 * Qué NO hay aquí, a propósito: dónde se GUARDA la semilla. Eso es IndexedDB + Argon2id + AES-GCM
 * en la web (`apps/web/lib/crypto/identity-store.ts`) y será el keychain del sistema en el móvil.
 * Es la única parte que de verdad cambia por plataforma, así que es la única que se queda fuera.
 *
 * Sobre "libsodium": el roadmap original decía libsodium y la implementación usa `@noble` +
 * `@scure`. Es deliberado y se queda así — están auditadas, son de los mismos autores, funcionan
 * igual en navegador/Node/React Native sin WASM, y cambiarlas ahora obligaría a migrar identidades
 * ya emitidas sin ganar nada. La regla de `docs/PLANTILLA.md §5` (cero primitivos propios) se
 * cumple igual.
 *
 * ⚠️ Contiene código criptográfico pendiente de REVISIÓN HUMANA (docs/PLANTILLA.md §5):
 * `aead-stream.ts` y el sobre de `@aegis/protocol`.
 */

export {
  concatBytes,
  fromBase64Url,
  fromUtf8,
  toBase64Url,
  utf8,
} from "./bytes";

export {
  AegisCryptoError,
  cryptoError,
  setCryptoErrorTranslator,
  type CryptoErrorCode,
  type CryptoErrorParams,
  type CryptoErrorTranslator,
} from "./errors";

export { hkdfSha256, sha256 } from "./kdf";
export { fillRandom, randomBytes } from "./random";

export {
  SEED_BYTES,
  fingerprint16,
  generateSeed,
  publicKeyFromSeed,
  signWithSeed,
  verifyWithPublicKey,
} from "./ed25519";

export {
  X25519_PUBLIC_BYTES,
  buildSignedPrekey,
  prekeyMessage,
  sharedSecretWith,
  x25519PublicFromSeed,
} from "./x25519";

export {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  aeadDecrypt,
  aeadEncrypt,
  deriveAeadKey,
  randomNonce,
} from "./aead";

export {
  DEFAULT_CHUNK_BYTES,
  MEDIA_KEY_BYTES,
  decryptMedia,
  encryptMedia,
  randomMediaKey,
} from "./aead-stream";

export {
  RECOVERY_PHRASE_WORDS,
  decodeAnyRecovery,
  decodeRecovery,
  extractRecoveryFromText,
  isValidRecoveryPhrase,
  phraseToSeed,
  seedToPhrase,
} from "./recovery-phrase";
