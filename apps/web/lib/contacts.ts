/**
 * Contactos locales (IndexedDB). Un contacto es un peer con el que se puede conversar:
 * su identidad Ed25519 y su prekey X25519 YA VERIFICADA (firma comprobada contra la
 * identidad, anti-MITM del relay — ver `verifyPeerPrekey` de @aegis/protocol).
 *
 * Se guardan por ORIGEN: IndexedDB es per-origin, así que la .onion y la clearnet tienen
 * cada una su lista. La identidad y el buzón de mensajes SÍ son los mismos en las dos
 * puertas (viven en el relay por clave pública); los contactos son solo una libreta local
 * de conveniencia y se pueden re-resolver por handle desde el directorio en cualquier puerta.
 *
 * Solo se ejecuta en navegador (IndexedDB).
 */
import { fingerprint16, fromBase64Url, verifyPeerPrekey } from "./crypto";
import { fetchBundle, type DirectoryEntry } from "./relay-client";
import type { ContactUri } from "./contact-uri";
import { dict } from "./i18n/runtime";

const DB_NAME = "aegis-contacts";
const DB_VERSION = 1;
const STORE = "contacts";

/** Contacto persistido. La clave del store es `pub` (Ed25519 en base64url). */
export interface Contact {
  pub: string; // Ed25519 del peer (base64url) — identidad + clave del store
  x25519: string; // prekey X25519 del peer (base64url), ya verificada
  handle: string | null; // handle público con el que se resolvió, si lo hay
  fingerprint: string; // huella legible de la identidad
  addedAt: string; // ISO-8601
}

// --- IndexedDB helpers ----------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "pub" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- API ------------------------------------------------------------------------------

/** Todos los contactos guardados, ordenados por handle/huella para el desplegable. */
export async function listContacts(): Promise<Contact[]> {
  const all = await tx<Contact[]>("readonly", (s) => s.getAll() as IDBRequest<Contact[]>);
  return all.sort((a, b) => (a.handle ?? a.fingerprint).localeCompare(b.handle ?? b.fingerprint));
}

/** Un contacto por su clave pública Ed25519 (base64url), o null si no está guardado. */
export async function getContact(pub: string): Promise<Contact | null> {
  const c = await tx<Contact | undefined>("readonly", (s) => s.get(pub));
  return c ?? null;
}

/** Elimina un contacto de la libreta local (no afecta al buzón ni al historial). */
export function removeContact(pub: string): Promise<void> {
  return tx<undefined>("readwrite", (s) => s.delete(pub) as IDBRequest<undefined>).then(() => undefined);
}

/**
 * Convierte una entrada del directorio del relay en un contacto guardado. VERIFICA la firma
 * de la prekey X25519 contra la identidad Ed25519 antes de guardar (si el relay intentara
 * colar una prekey suya, la firma no cuadra y se rechaza). Lanza si falta el bundle o la
 * firma es inválida.
 */
export async function addContactFromDirectory(entry: DirectoryEntry): Promise<Contact> {
  if (!entry.keyBundle) {
    throw new Error(dict().errors.noPrekey);
  }
  return verifyAndSave({
    pub: entry.publicKey,
    x25519: entry.keyBundle.x25519PublicKey,
    signature: entry.keyBundle.x25519Signature,
    handle: entry.username,
  });
}

/**
 * Verifica la firma de una prekey contra la identidad y, solo si cuadra, guarda el contacto.
 * ES EL ÚNICO CAMINO por el que entra un contacto a la libreta, venga del directorio o de un QR:
 * así no hay dos sitios donde equivocarse con la verificación. No toca la red.
 */
async function verifyAndSave(input: {
  pub: string;
  x25519: string;
  signature: string;
  handle: string | null;
}): Promise<Contact> {
  const edPub = fromBase64Url(input.pub);
  const x25519Pub = fromBase64Url(input.x25519);
  const signature = fromBase64Url(input.signature);
  const ok = await verifyPeerPrekey(edPub, x25519Pub, signature);
  if (!ok) {
    throw new Error("No podemos verificar que esta llave sea de verdad de esa persona; se rechaza por seguridad.");
  }
  const contact: Contact = {
    pub: input.pub,
    x25519: input.x25519,
    handle: input.handle,
    // Huella LEGIBLE de 16 letras (no la clave cruda: `entry.fingerprint` del relay ES la clave
    // en base64url). Así ninguna vista muestra la clave pública en bruto.
    fingerprint: fingerprint16(edPub),
    addedAt: new Date().toISOString(),
  };
  await tx("readwrite", (s) => s.put(contact));
  return contact;
}

/**
 * Añade un contacto a partir de su clave pública Ed25519 (base64url) — el caso del QR: la clave
 * llega FUERA DE BANDA (escaneada/pegada) y aquí descargamos su key bundle del directorio y lo
 * VERIFICAMOS antes de guardar (mismo camino anti-MITM que `addContactFromDirectory`). El relay no
 * puede sustituir la identidad porque la clave no salió de él; y no puede colar una prekey ajena
 * porque su firma no cuadraría con esta clave. Lanza si la identidad no existe o no publicó prekey.
 */
export async function addContactByPublicKey(token: string, pub: string): Promise<Contact> {
  const entry = await fetchBundle(token, pub);
  return addContactFromDirectory(entry);
}

/**
 * Alta a partir de un QR AUTOSUFICIENTE (`aegis://contact/v1?k=…&x=…&s=…`): la identidad, la prekey
 * y su firma llegan las tres fuera de banda, así que **no se toca la red**. Es el camino que hace
 * posible conocerse sin relay: cara a cara en un apagón, o con el relay bloqueado.
 *
 * La seguridad es la MISMA que por el directorio, y por el mismo motivo de siempre: la firma la
 * hace la identidad Ed25519 del peer, no el servidor. Si alguien altera la prekey del QR, la firma
 * deja de cuadrar y `verifyAndSave` lo rechaza. El relay nunca fue la fuente de confianza — solo el
 * mensajero, y aquí sobra.
 *
 * Lanza si el QR no trae bundle: quien llama debe caer entonces a `addContactByPublicKey`.
 */
export async function addContactFromUriBundle(uri: ContactUri): Promise<Contact> {
  if (!uri.prekey || !uri.prekeySignature) {
    throw new Error(dict().errors.noPrekey);
  }
  return verifyAndSave({
    pub: uri.pub,
    x25519: uri.prekey,
    signature: uri.prekeySignature,
    handle: uri.handle,
  });
}
