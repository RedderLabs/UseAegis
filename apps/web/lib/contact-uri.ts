/**
 * URI de contacto para el QR — el formato que se codifica en el código y se lee al escanearlo.
 *
 *   aegis://contact/v1?k=<Ed25519 pub base64url>&h=<handle>&x=<prekey X25519>&s=<firma>
 *
 * Lo ÚNICO imprescindible es la clave pública Ed25519 (`k`): al viajar por el QR llega FUERA DE
 * BANDA (la cámara/la imagen, un canal físico que el relay no controla), así que el servidor no
 * puede colar una identidad distinta. El `handle` es solo para mostrar; la seguridad no depende de
 * él.
 *
 * `x` + `s` son el **key bundle en mano**: la prekey X25519 y su firma Ed25519, las mismas que se
 * publican en el directorio. Van juntas o no van: una prekey sin firma no vale nada. Que viajen
 * aquí NO relaja el anti-MITM — la firma la hace la identidad del peer, y quien añade la verifica
 * igual (`contacts.ts` → `addContactFromUriBundle`); el relay nunca fue la fuente de confianza,
 * solo el mensajero. Lo que cambia es que deja de hacer falta el mensajero: con `x`+`s` el alta es
 * PRESENCIAL Y SIN RED, que es el prerrequisito del Modo C (malla local) y también lo que salva el
 * alta cuando el relay está bloqueado.
 *
 * Compatibilidad: un QR viejo (solo `k`) sigue siendo válido y cae al camino del directorio.
 *
 * Módulo PURO (solo strings + base64url): se ejecuta igual en el navegador y en Node (tests). La
 * verificación de la firma NO vive aquí (necesita cripto asíncrona): ver `contacts.ts`.
 */
import { fromBase64Url, toBase64Url } from "./crypto";
import { dict } from "./i18n/runtime";

/** Prefijo de esquema + versión. Cambiar la versión si el formato deja de ser compatible. */
export const CONTACT_URI_PREFIX = "aegis://contact/v1";

/** Longitud en bytes de una clave pública Ed25519. */
const ED25519_PUBLIC_KEY_BYTES = 32;
/** Longitud en bytes de una clave pública X25519 (la prekey). */
const X25519_PUBLIC_KEY_BYTES = 32;
/** Longitud en bytes de una firma Ed25519. */
const ED25519_SIGNATURE_BYTES = 64;

/** Datos que porta un QR de contacto: identidad + (opcional) su @nombre y su key bundle. */
export interface ContactUri {
  /** Clave pública Ed25519 en base64url (identidad). */
  pub: string;
  /** Handle público, sin la @, o null si no se incluyó. */
  handle: string | null;
  /** Prekey X25519 en base64url, si el QR la trae. null → hay que ir al directorio. */
  prekey?: string | null;
  /** Firma Ed25519 (base64url) de la prekey. Solo tiene sentido junto a `prekey`. */
  prekeySignature?: string | null;
}

/** true si `value` es base64url que decodifica a exactamente `bytes` bytes. */
function isBase64UrlOfLength(value: string | null | undefined, bytes: number): value is string {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return fromBase64Url(value).length === bytes;
  } catch {
    return false;
  }
}

/** true si `value` es base64url que decodifica a exactamente 32 bytes (una clave Ed25519). */
function isEd25519PublicKey(value: string): boolean {
  return isBase64UrlOfLength(value, ED25519_PUBLIC_KEY_BYTES);
}

/**
 * Normaliza el par prekey+firma: o están las dos y con la longitud exacta, o no hay bundle.
 * Un `x` sin `s` (o al revés) se DESCARTA en silencio en vez de invalidar el QR entero: el alta
 * cae entonces al directorio, que verifica igual. Ignorar es seguro; lo que nunca se hace es
 * guardar una prekey sin comprobar su firma.
 */
function cleanBundle(
  prekey: string | null | undefined,
  signature: string | null | undefined,
): { prekey: string | null; prekeySignature: string | null } {
  const ok =
    isBase64UrlOfLength(prekey, X25519_PUBLIC_KEY_BYTES) &&
    isBase64UrlOfLength(signature, ED25519_SIGNATURE_BYTES);
  return ok
    ? { prekey: prekey as string, prekeySignature: signature as string }
    : { prekey: null, prekeySignature: null };
}

/** Normaliza un handle candidato a la forma pública (`^[a-z][a-z0-9_]{2,19}$`) o null si no vale. */
function cleanHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z][a-z0-9_]{2,19}$/.test(h) ? h : null;
}

/** Construye la URI de contacto para MI identidad (la que se pinta como QR y se copia). */
export function encodeContactUri({ pub, handle, prekey, prekeySignature }: ContactUri): string {
  if (!isEd25519PublicKey(pub)) {
    throw new Error(dict().errors.invalidPublicKey);
  }
  let uri = `${CONTACT_URI_PREFIX}?k=${pub}`;
  const h = cleanHandle(handle);
  if (h) uri += `&h=${h}`;
  const bundle = cleanBundle(prekey, prekeySignature);
  if (bundle.prekey) uri += `&x=${bundle.prekey}&s=${bundle.prekeySignature}`;
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

  // Caso 1: clave pública suelta (sin esquema). Nunca trae bundle: hay que ir al directorio.
  if (!text.includes("://") && isEd25519PublicKey(text)) {
    return { pub: text, handle: null, prekey: null, prekeySignature: null };
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
  return {
    pub,
    handle: cleanHandle(params.get("h")),
    ...cleanBundle(params.get("x"), params.get("s")),
  };
}

/**
 * Ayuda: reconstruye la URI a partir de bytes crudos. Con `bundle` (prekey + firma, tal como los
 * devuelve `buildSignedPrekey`) el QR queda autosuficiente y quien lo escanea no necesita al relay.
 */
export function contactUriFromBytes(
  pub: Uint8Array,
  handle: string | null,
  bundle?: { x25519PublicKey: Uint8Array; signature: Uint8Array },
): string {
  return encodeContactUri({
    pub: toBase64Url(pub),
    handle,
    prekey: bundle ? toBase64Url(bundle.x25519PublicKey) : null,
    prekeySignature: bundle ? toBase64Url(bundle.signature) : null,
  });
}
