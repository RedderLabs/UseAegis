/**
 * Almacén local de la identidad del dispositivo en IndexedDB.
 *
 * Guarda la semilla Ed25519 (32 bytes) y la clave pública derivada. La privada NUNCA
 * sale del dispositivo salvo que el usuario exporte explícitamente su código de
 * recuperación. Modelo "keypair en el dispositivo": para entrar desde otro equipo hay
 * que importar la semilla (ver register/login).
 *
 * Solo se ejecuta en navegador (usa IndexedDB).
 */
import {
  fingerprint16,
  fromBase64Url,
  generateSeed,
  publicKeyFromSeed,
  toBase64Url,
} from "./ed25519";

const DB_NAME = "aegis";
const DB_VERSION = 1;
const STORE = "identity";
const KEY = "self";

export interface StoredIdentity {
  seed: Uint8Array;
  publicKey: Uint8Array;
}

/** Vista pública de la identidad (sin la semilla) para la UI. */
export interface IdentityInfo {
  publicKeyB64: string;
  fingerprint: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
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
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function loadRecord(): Promise<StoredIdentity | null> {
  const raw = await tx<StoredIdentity | undefined>("readonly", (s) => s.get(KEY));
  return raw ?? null;
}

async function saveSeed(seed: Uint8Array): Promise<IdentityInfo> {
  const publicKey = await publicKeyFromSeed(seed);
  await tx("readwrite", (s) => s.put({ seed, publicKey } satisfies StoredIdentity, KEY));
  return { publicKeyB64: toBase64Url(publicKey), fingerprint: await fingerprint16(publicKey) };
}

/** Info de la identidad guardada en este dispositivo, o null si no hay ninguna. */
export async function getStoredIdentity(): Promise<IdentityInfo | null> {
  const rec = await loadRecord();
  if (!rec) return null;
  return {
    publicKeyB64: toBase64Url(rec.publicKey),
    fingerprint: await fingerprint16(rec.publicKey),
  };
}

/** Crea una identidad nueva (semilla aleatoria) y la persiste. */
export function createIdentity(): Promise<IdentityInfo> {
  return saveSeed(generateSeed());
}

/** Persiste una semilla concreta (p. ej. la candidata mostrada en el registro). */
export function persistSeed(seed: Uint8Array): Promise<IdentityInfo> {
  if (seed.length !== 32) {
    return Promise.reject(new Error("Semilla inválida (se esperan 32 bytes)."));
  }
  return saveSeed(seed);
}

/** Importa una identidad desde su código de recuperación (semilla en base64url). */
export function importIdentity(recoveryB64: string): Promise<IdentityInfo> {
  const seed = fromBase64Url(recoveryB64.trim());
  if (seed.length !== 32) {
    return Promise.reject(new Error("Código de recuperación inválido (se esperan 32 bytes)."));
  }
  return saveSeed(seed);
}

/** Código de recuperación (semilla en base64url) para respaldar/mover la identidad. */
export async function exportRecovery(): Promise<string | null> {
  const rec = await loadRecord();
  return rec ? toBase64Url(rec.seed) : null;
}

/** Firma un mensaje con la semilla guardada. Lanza si no hay identidad. */
export async function signWithStoredIdentity(message: Uint8Array): Promise<Uint8Array> {
  const rec = await loadRecord();
  if (!rec) throw new Error("No hay identidad en este dispositivo.");
  const { signWithSeed } = await import("./ed25519");
  return signWithSeed(rec.seed, message);
}

/** Borra la identidad del dispositivo (p. ej. al cerrar una sesión segura). */
export function clearIdentity(): Promise<void> {
  return tx("readwrite", (s) => s.delete(KEY)).then(() => undefined);
}
