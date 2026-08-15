/**
 * Identidad Ed25519 del dispositivo (parte pura, sin almacenamiento).
 *
 * La clave privada es una semilla de 32 bytes generada con el CSPRNG del sistema. De ella se
 * derivan la clave pública y la firma con `@noble/ed25519` — librería auditada (satisface
 * `docs/PLANTILLA.md §5`: nada de primitivos propios).
 *
 * Este fichero NO toca almacenamiento ni API del navegador: corre igual en la web, en Node
 * (tests) y en React Native. El almacén de la semilla —IndexedDB en la web, keychain en el
 * móvil— es responsabilidad de cada app, no de este paquete.
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "./kdf";
import { randomBytes } from "./random";

export const SEED_BYTES = 32;

/** Genera una semilla Ed25519 nueva (32 bytes de alta entropía). */
export function generateSeed(): Uint8Array {
  return randomBytes(SEED_BYTES);
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

/**
 * Huella legible de 16 letras A–Z derivada de la clave pública (SHA-256 → 16 letras).
 * Es determinista y estable por identidad, y mantiene el formato que esperan los gates
 * (`/^[A-Z]{16}$/`). Es lo que dos personas comparan para verificarse, así que su valor
 * NO puede cambiar entre plataformas ni versiones (ver `kdf.ts`).
 */
export function fingerprint16(publicKey: Uint8Array): string {
  const digest = sha256(publicKey);
  let out = "";
  for (let i = 0; i < 16; i++) out += String.fromCharCode(65 + (digest[i]! % 26));
  return out;
}
