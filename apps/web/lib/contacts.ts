/**
 * Contactos locales (IndexedDB). Un contacto es un peer con el que se puede conversar:
 * su identidad Ed25519 y su prekey X25519 YA VERIFICADA (firma comprobada contra la
 * identidad, anti-MITM del relay — ver lib/crypto/messaging.ts `verifyPeerPrekey`).
 *
 * Se guardan por ORIGEN: IndexedDB es per-origin, así que la .onion y la clearnet tienen
 * cada una su lista. La identidad y el buzón de mensajes SÍ son los mismos en las dos
 * puertas (viven en el relay por clave pública); los contactos son solo una libreta local
 * de conveniencia y se pueden re-resolver por handle desde el directorio en cualquier puerta.
 *
 * Solo se ejecuta en navegador (IndexedDB).
 */
import { fromBase64Url } from "./crypto/ed25519";
import { verifyPeerPrekey } from "./crypto/messaging";
import type { DirectoryEntry } from "./relay-client";

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
    throw new Error("Ese usuario aún no ha publicado su llave de cifrado; no se puede añadir.");
  }
  const edPub = fromBase64Url(entry.publicKey);
  const x25519Pub = fromBase64Url(entry.keyBundle.x25519PublicKey);
  const signature = fromBase64Url(entry.keyBundle.x25519Signature);
  const ok = await verifyPeerPrekey(edPub, x25519Pub, signature);
  if (!ok) {
    throw new Error("No podemos verificar que esta llave sea de verdad de esa persona; se rechaza por seguridad.");
  }
  const contact: Contact = {
    pub: entry.publicKey,
    x25519: entry.keyBundle.x25519PublicKey,
    handle: entry.username,
    fingerprint: entry.fingerprint,
    addedAt: new Date().toISOString(),
  };
  await tx("readwrite", (s) => s.put(contact));
  return contact;
}
