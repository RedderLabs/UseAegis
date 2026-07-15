/**
 * Identidad Ed25519 del dispositivo (parte pura, sin almacenamiento).
 *
 * La clave privada es una semilla de 32 bytes generada con el CSPRNG del sistema
 * (`crypto.getRandomValues`). De ella se derivan la clave pública y la firma con
 * `@noble/ed25519` — librería auditada (satisface `docs/PLANTILLA.md §5`: nada de
 * primitivos propios). Cuando `@aegis/crypto-core` (libsodium) esté implementado,
 * esta lógica debería migrar allí.
 *
 * Este archivo NO toca IndexedDB, así que es ejecutable/testeable también en Node.
 */
import * as ed from "@noble/ed25519";

export const SEED_BYTES = 32;

/** Genera una semilla Ed25519 nueva (32 bytes de alta entropía). */
export function generateSeed(): Uint8Array {
  const seed = new Uint8Array(SEED_BYTES);
  crypto.getRandomValues(seed);
  return seed;
}

/** Deriva la clave pública Ed25519 (32 bytes) desde la semilla. */
export function publicKeyFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  return ed.getPublicKeyAsync(seed);
}

/** Firma un mensaje con la semilla; devuelve la firma Ed25519 (64 bytes). */
export function signWithSeed(seed: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  return ed.signAsync(message, seed);
}

/**
 * Verifica una firma Ed25519 contra una clave PÚBLICA (32 bytes). Necesario para:
 *  - validar la prekey X25519 de un peer al descargarla (anti-MITM del relay), y
 *  - autenticar al remitente de un mensaje (firma dentro del sobre sealed-sender).
 * Devuelve false ante cualquier entrada malformada en vez de lanzar.
 */
export async function verifyWithPublicKey(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

// --- Codificación ---------------------------------------------------------------

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Huella legible de 16 letras A–Z derivada de la clave pública (SHA-256 → 16 letras).
 * Es determinista y estable por identidad: sustituye a la cadena aleatoria del mockup
 * anterior, pero mantiene el formato que esperan los gates (`/^[A-Z]{16}$/`).
 */
export async function fingerprint16(publicKey: Uint8Array): Promise<string> {
  // Cast: TS 5.7 estrecha BufferSource y el genérico de Uint8Array de noble no encaja.
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", publicKey as unknown as BufferSource),
  );
  let out = "";
  for (let i = 0; i < 16; i++) out += String.fromCharCode(65 + (digest[i]! % 26));
  return out;
}
