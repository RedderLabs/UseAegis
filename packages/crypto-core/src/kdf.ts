/**
 * Derivación de claves: HKDF-SHA256 y SHA-256, en JavaScript puro sobre `@noble/hashes`.
 *
 * ⚠️ Este fichero es el que más cuidado exige de todo el paquete. Hasta ahora estas dos
 * operaciones las hacía **Web Crypto** (`crypto.subtle.deriveBits` / `crypto.subtle.digest`), que
 * no existe en React Native. Se han sustituido por `@noble/hashes` (auditada, ya era dependencia
 * del proyecto y la misma familia que `@noble/curves`), y eso solo es aceptable si el resultado es
 * **byte a byte idéntico**:
 *
 *  - de este HKDF sale la clave privada X25519 de CADA identidad (`x25519PrivateFromSeed`). Si
 *    cambiara un solo bit, toda identidad ya existente publicaría una prekey distinta y no podría
 *    descifrar ni un mensaje en vuelo ni su propio historial;
 *  - de este SHA-256 sale la huella pública de 16 letras que el usuario compara con su contacto;
 *  - y de este HKDF sale también la clave AEAD de cada sobre.
 *
 * Por eso `kdf.test.ts` compara las dos implementaciones contra Web Crypto con las MISMAS llamadas
 * que hace el resto del paquete. Ambas son RFC 5869 / FIPS 180-4, así que la equivalencia es
 * esperable, pero aquí se comprueba en vez de suponerse.
 *
 * Regla dura (docs/PLANTILLA.md §5): sin primitivos propios — solo librerías auditadas.
 */
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";

/**
 * HKDF-SHA256 (RFC 5869): extrae y expande `ikm` a `length` bytes.
 *
 * `salt` vacío es válido y significa lo mismo que en Web Crypto: HMAC rellena con ceros hasta el
 * tamaño de bloque, así que un salt de longitud 0 y uno de 32 ceros derivan la misma clave.
 */
export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Uint8Array {
  return hkdf(nobleSha256, ikm, salt, info, length);
}

/** SHA-256 de `data`. */
export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}
