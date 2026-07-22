/**
 * URI de contacto para el QR — el formato que se codifica en el código y se lee al escanearlo.
 *
 *   aegis://contact/v1?k=<Ed25519 pub base64url>&h=<handle>
 *
 * Lo ÚNICO imprescindible es la clave pública Ed25519 (`k`): al viajar por el QR llega FUERA DE
 * BANDA (la cámara/la imagen, un canal físico que el relay no controla), así que el servidor no
 * puede colar una identidad distinta. El `handle` es solo para mostrar; la seguridad no depende de
 * él. Al añadir, se descarga el key bundle del directorio y se VERIFICA la firma de la prekey
 * contra esta clave (ver `contacts.ts` → `addContactByPublicKey` → `addContactFromDirectory`): si
 * el relay sirviera una prekey que no es de esta identidad, la firma no cuadra y se rechaza.
 *
 * Módulo PURO (solo strings + base64url): se ejecuta igual en el navegador y en Node (tests).
 */
import { fromBase64Url, toBase64Url } from "./crypto/ed25519";

/** Prefijo de esquema + versión. Cambiar la versión si el formato deja de ser compatible. */
export const CONTACT_URI_PREFIX = "aegis://contact/v1";

/** Longitud en bytes de una clave pública Ed25519. */
const ED25519_PUBLIC_KEY_BYTES = 32;

/** Datos que porta un QR de contacto: identidad + (opcional) su @nombre para mostrar. */
export interface ContactUri {
  /** Clave pública Ed25519 en base64url (identidad). */
  pub: string;
  /** Handle público, sin la @, o null si no se incluyó. */
  handle: string | null;
}

/** true si `value` es base64url que decodifica a exactamente 32 bytes (una clave Ed25519). */
function isEd25519PublicKey(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return fromBase64Url(value).length === ED25519_PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
}

/** Normaliza un handle candidato a la forma pública (`^[a-z][a-z0-9_]{2,19}$`) o null si no vale. */
function cleanHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z][a-z0-9_]{2,19}$/.test(h) ? h : null;
}

/** Construye la URI de contacto para MI identidad (la que se pinta como QR y se copia). */
export function encodeContactUri({ pub, handle }: ContactUri): string {
  if (!isEd25519PublicKey(pub)) {
    throw new Error("Clave pública inválida: no es una identidad Ed25519 de 32 bytes.");
  }
  let uri = `${CONTACT_URI_PREFIX}?k=${pub}`;
  const h = cleanHandle(handle);
  if (h) uri += `&h=${h}`;
  return uri;
}

/**
 * Interpreta lo que se pega o se escanea. Tolerante:
 *  - una URI `aegis://contact/v1?k=…&h=…` completa, o
 *  - una clave pública Ed25519 en base64url "a pelo" (por si alguien comparte solo la clave).
 * Devuelve null si no es ninguna de las dos (entrada basura, versión desconocida, clave mala).
 */
export function parseContactUri(input: string): ContactUri | null {
  const text = input.trim();
  if (!text) return null;

  // Caso 1: clave pública suelta (sin esquema).
  if (!text.includes("://") && isEd25519PublicKey(text)) {
    return { pub: text, handle: null };
  }

  // Caso 2: URI con esquema. Debe empezar EXACTAMENTE por el prefijo con versión.
  if (!text.startsWith(`${CONTACT_URI_PREFIX}?`)) return null;
  let params: URLSearchParams;
  try {
    params = new URL(text).searchParams;
  } catch {
    return null;
  }
  const pub = params.get("k");
  if (!pub || !isEd25519PublicKey(pub)) return null;
  return { pub, handle: cleanHandle(params.get("h")) };
}

/** Ayuda: reconstruye la URI a partir de bytes crudos de la clave pública. */
export function contactUriFromBytes(pub: Uint8Array, handle: string | null): string {
  return encodeContactUri({ pub: toBase64Url(pub), handle });
}
