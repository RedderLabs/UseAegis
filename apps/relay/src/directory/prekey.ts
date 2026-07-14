// Prekey X25519 firmada: el "material compartido" que permite a dos usuarios acordar
// una clave sin que el relay intervenga en el secreto.
//
// El usuario deriva un par X25519 de su semilla, y firma la parte PÚBLICA con su clave
// Ed25519 de identidad. Esa firma ata la prekey a la identidad: cuando un peer descarga
// la prekey, verifica la firma contra la clave Ed25519 (que ya conoce por el handshake o
// por el QR de contacto) y así comprueba que el relay no la ha sustituido por una suya.
// Es la defensa auditable contra un relay que intente un man-in-the-middle.
import { verifySignature } from "../auth/ed25519";

/** Separación de dominio: nada firmado aquí es reutilizable como firma de auth (otro dominio). */
export const PREKEY_DOMAIN = Buffer.from("aegis-prekey:v1:", "utf8");

/** Mensaje canónico que el cliente firma al publicar su prekey: dominio || prekey X25519. */
export function prekeyMessage(x25519PublicKey: Buffer): Buffer {
  return Buffer.concat([PREKEY_DOMAIN, x25519PublicKey]);
}

/**
 * Comprueba que `signature` (Ed25519, 64 bytes) es una firma válida de la prekey X25519
 * hecha con la clave de identidad `identityKey`. Devuelve false ante cualquier entrada
 * malformada en vez de lanzar.
 */
export function verifyPrekeySignature(
  identityKey: Buffer,
  x25519PublicKey: Buffer,
  signature: Buffer,
): boolean {
  if (x25519PublicKey.length !== 32) return false;
  return verifySignature(identityKey, prekeyMessage(x25519PublicKey), signature);
}
