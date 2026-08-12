/**
 * Acuerdo de claves X25519 (ECDH) — el "material compartido" para conectar dos usuarios.
 *
 * El par X25519 se DERIVA de forma determinista de la misma semilla Ed25519 de la
 * identidad (docs/ARQUITECTURA.md §2, "X25519: derivado para acuerdo de claves"), vía
 * HKDF-SHA256 con una etiqueta de dominio. Así:
 *   - el usuario solo respalda UNA semilla (la Ed25519) y recupera ambas claves;
 *   - la clave de firma y la de ECDH quedan separadas (higiene criptográfica: no se
 *     reutiliza la clave de identidad como clave DH);
 *   - la parte pública se publica FIRMADA con la Ed25519 (ver `prekeyMessage`), lo que
 *     ata la prekey a la identidad y bloquea que el relay cuele una prekey suya (MITM).
 *
 * X25519 lo aporta `@noble/curves` (auditado); no implementamos primitivos propios
 * (docs/PLANTILLA.md §5). Solo se ejecuta en navegador (usa Web Crypto para el HKDF).
 */
import { x25519 } from "@noble/curves/ed25519";
import { signWithSeed } from "./ed25519";
import { dict } from "../i18n/runtime";

/** Debe coincidir byte a byte con `PREKEY_DOMAIN` del relay (apps/relay/src/directory/prekey.ts). */
const PREKEY_DOMAIN = new TextEncoder().encode("aegis-prekey:v1:");

/** Etiqueta HKDF que separa la clave X25519 de cualquier otro uso de la semilla. */
const X25519_INFO = new TextEncoder().encode("aegis-x25519:v1");

export const X25519_PUBLIC_BYTES = 32;

/**
 * Deriva la clave privada X25519 (32 bytes) desde la semilla Ed25519 mediante HKDF-SHA256.
 * Determinista: la misma semilla produce siempre la misma clave DH.
 */
async function x25519PrivateFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey("raw", seed as unknown as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: X25519_INFO },
    ikm,
    256, // 32 bytes
  );
  return new Uint8Array(bits);
}

/** Clave pública X25519 (32 bytes) derivada de la semilla Ed25519. */
export async function x25519PublicFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  const priv = await x25519PrivateFromSeed(seed);
  return x25519.getPublicKey(priv);
}

/** Mensaje canónico que se firma con Ed25519 al publicar la prekey: dominio || prekey. */
export function prekeyMessage(x25519PublicKey: Uint8Array): Uint8Array {
  const out = new Uint8Array(PREKEY_DOMAIN.length + x25519PublicKey.length);
  out.set(PREKEY_DOMAIN, 0);
  out.set(x25519PublicKey, PREKEY_DOMAIN.length);
  return out;
}

/**
 * Construye la prekey X25519 a publicar y su firma Ed25519 (dominio || prekey), ambas
 * derivadas/firmadas con la semilla de la identidad. El relay verifica la firma antes de
 * aceptarla; el peer la vuelve a verificar al descargarla (defensa contra MITM del relay).
 */
export async function buildSignedPrekey(
  seed: Uint8Array,
): Promise<{ x25519PublicKey: Uint8Array; signature: Uint8Array }> {
  const x25519PublicKey = await x25519PublicFromSeed(seed);
  const signature = await signWithSeed(seed, prekeyMessage(x25519PublicKey));
  return { x25519PublicKey, signature };
}

/**
 * Secreto compartido (32 bytes) con un peer: ECDH entre nuestra clave privada X25519
 * (derivada de `seed`) y la clave pública X25519 del peer. Base de la clave de sesión;
 * el relay nunca lo ve. Normalmente se pasa después por un KDF para la clave simétrica
 * real (XChaCha20-Poly1305) — eso vivirá en `@aegis/crypto-core`.
 */
export async function sharedSecretWith(
  seed: Uint8Array,
  peerX25519PublicKey: Uint8Array,
): Promise<Uint8Array> {
  if (peerX25519PublicKey.length !== X25519_PUBLIC_BYTES) {
    throw new Error(dict().errors.invalidPeerKey);
  }
  const priv = await x25519PrivateFromSeed(seed);
  return x25519.getSharedSecret(priv, peerX25519PublicKey);
}
