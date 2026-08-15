/**
 * Generación de identidad para las pantallas de acceso (mockup de UI).
 *
 * Usa el CSPRNG del navegador (Web Crypto `getRandomValues`), NUNCA `Math.random`.
 * En el cliente real, la identidad se deriva de un par de claves Ed25519 dentro de
 * `@aegis/crypto-core`; este string alfabético de 16 letras es la representación
 * legible que el usuario reconoce (la huella, no una contraseña que se teclee).
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Longitud de la identidad alfabética (letras A–Z). */
export const IDENTITY_LENGTH = 16;

/** Identidad alfabética de alta entropía (por defecto 16 letras A–Z). */
export function generateIdentity(length = IDENTITY_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Agrupa en bloques de 4 para lectura/comparación: `ABCD · EFGH · IJKL`. */
export function groupIdentity(id: string): string {
  return (id.match(/.{1,4}/g) ?? [id]).join(" · ");
}

/** Normaliza lo que teclea el usuario: solo letras, mayúsculas, máx. 16. */
export function normalizeIdentity(raw: string, length = IDENTITY_LENGTH): string {
  return raw.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, length);
}
