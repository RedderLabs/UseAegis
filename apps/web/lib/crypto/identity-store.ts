/**
 * Keystore cifrado de la identidad del dispositivo (IndexedDB + Web Crypto).
 *
 * Modelo de equipo compartido: la semilla Ed25519 se guarda SIEMPRE cifrada con la
 * passphrase del usuario (ver lib/crypto/vault.ts). Al entrar NO se auto-inicia sesión:
 * hay que desbloquear con la passphrase, que descifra la semilla y la mantiene EN MEMORIA
 * durante la sesión. Al bloquear (logout / cerrar), la semilla en memoria se borra. Sin la
 * passphrase, otra persona en el mismo equipo no puede firmar nada con la identidad.
 *
 * La clave privada nunca sale del dispositivo salvo que el usuario exporte su código de
 * recuperación (la semilla), que solo está disponible con el vault desbloqueado.
 *
 * De la misma semilla se deriva el par X25519 para acuerdo de claves (lib/crypto/x25519.ts):
 * así una sola passphrase gobierna identidad, firma y ECDH.
 *
 * Solo se ejecuta en navegador (IndexedDB).
 */
import { fingerprint16, fromBase64Url, publicKeyFromSeed, signWithSeed, toBase64Url } from "./ed25519";
import { openSeed, sealSeed, type VaultBlob } from "./vault";
import { buildSignedPrekey as buildPrekey, sharedSecretWith, x25519PublicFromSeed } from "./x25519";
import {
  openEnvelope,
  sealEnvelope,
  type IncomingMessage,
  type OutgoingMessage,
} from "./messaging";

const DB_NAME = "aegis";
const DB_VERSION = 1;
const STORE = "identity";
const KEY = "self";

/** Registro cifrado que se persiste. `publicKey` va en claro (es pública) para mostrar la huella. */
interface KeystoreRecord {
  vault: VaultBlob;
  publicKey: Uint8Array;
}

/** Registro antiguo, en claro, del modelo anterior (semilla sin cifrar). Se migra al cifrado. */
interface LegacyRecord {
  seed: Uint8Array;
  publicKey: Uint8Array;
}

/** Vista pública de la identidad (sin la semilla) para la UI. */
export interface IdentityInfo {
  publicKeyB64: string;
  fingerprint: string;
}

/** Estado del keystore al arrancar el login. */
export type KeystoreStatus =
  | { state: "empty" }
  | { state: "locked"; publicKeyB64: string; fingerprint: string }
  | { state: "legacy"; publicKeyB64: string; fingerprint: string };

// --- Sesión desbloqueada (solo en memoria, nunca se persiste) ------------------------
let unlockedSeed: Uint8Array | null = null;

// --- IndexedDB helpers ----------------------------------------------------------------

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

type StoredRecord = KeystoreRecord | LegacyRecord;

function loadRecord(): Promise<StoredRecord | null> {
  return tx<StoredRecord | undefined>("readonly", (s) => s.get(KEY)).then((r) => r ?? null);
}

function isLegacy(rec: StoredRecord): rec is LegacyRecord {
  return "seed" in rec && !("vault" in rec);
}

async function info(publicKey: Uint8Array): Promise<IdentityInfo> {
  return { publicKeyB64: toBase64Url(publicKey), fingerprint: await fingerprint16(publicKey) };
}

/** Fija la semilla como sesión desbloqueada en memoria (reemplaza la anterior, si la había). */
function setUnlocked(seed: Uint8Array): void {
  if (unlockedSeed) unlockedSeed.fill(0);
  unlockedSeed = seed;
}

function requireSeed(): Uint8Array {
  if (!unlockedSeed) throw new Error("Identidad bloqueada. Desbloquea con tu passphrase.");
  return unlockedSeed;
}

// --- API de alto nivel ----------------------------------------------------------------

/** Estado del keystore de este dispositivo (sin desbloquear nada). */
export async function getKeystoreStatus(): Promise<KeystoreStatus> {
  const rec = await loadRecord();
  if (!rec) return { state: "empty" };
  const pub = rec.publicKey;
  const common = { publicKeyB64: toBase64Url(pub), fingerprint: await fingerprint16(pub) };
  return isLegacy(rec) ? { state: "legacy", ...common } : { state: "locked", ...common };
}

/** ¿Hay una semilla desbloqueada en memoria en esta pestaña? */
export function isUnlocked(): boolean {
  return unlockedSeed !== null;
}

/** Crea un keystore nuevo: sella la semilla con la passphrase, la persiste y la deja desbloqueada. */
export async function createKeystore(seed: Uint8Array, passphrase: string): Promise<IdentityInfo> {
  if (seed.length !== 32) throw new Error("Semilla inválida (se esperan 32 bytes).");
  const publicKey = await publicKeyFromSeed(seed);
  const vault = await sealSeed(seed, passphrase);
  await tx("readwrite", (s) => s.put({ vault, publicKey } satisfies KeystoreRecord, KEY));
  setUnlocked(seed);
  return info(publicKey);
}

/** Desbloquea el keystore con la passphrase: descifra la semilla y la deja en memoria. */
export async function unlockKeystore(passphrase: string): Promise<IdentityInfo> {
  const rec = await loadRecord();
  if (!rec || isLegacy(rec)) throw new Error("No hay un keystore cifrado en este dispositivo.");
  const seed = await openSeed(rec.vault, passphrase); // lanza si la passphrase es incorrecta
  const publicKey = await publicKeyFromSeed(seed);
  // Coherencia: la semilla descifrada debe reproducir la clave pública almacenada.
  if (toBase64Url(publicKey) !== toBase64Url(rec.publicKey)) {
    throw new Error("El keystore está corrupto (la clave no coincide).");
  }
  setUnlocked(seed);
  return info(publicKey);
}

/** Migra un keystore antiguo sin cifrar: lo sella con una passphrase y lo deja desbloqueado. */
export async function migrateLegacy(passphrase: string): Promise<IdentityInfo> {
  const rec = await loadRecord();
  if (!rec || !isLegacy(rec)) throw new Error("No hay una identidad sin cifrar que migrar.");
  return createKeystore(rec.seed, passphrase);
}

/** Importa una identidad desde su código de recuperación y la protege con una passphrase. */
export async function importKeystore(recoveryB64: string, passphrase: string): Promise<IdentityInfo> {
  const seed = fromBase64Url(recoveryB64.trim());
  if (seed.length !== 32) throw new Error("Código de recuperación inválido (se esperan 32 bytes).");
  return createKeystore(seed, passphrase);
}

/** Bloquea la sesión: borra la semilla de memoria (no toca lo persistido). */
export function lockKeystore(): void {
  if (unlockedSeed) unlockedSeed.fill(0);
  unlockedSeed = null;
}

/** Borra la identidad de este dispositivo por completo (persistida + memoria). */
export async function clearKeystore(): Promise<void> {
  lockKeystore();
  await tx("readwrite", (s) => s.delete(KEY));
}

/** Firma un mensaje con la semilla desbloqueada. Lanza si el keystore está bloqueado. */
export function signWithUnlockedIdentity(message: Uint8Array): Promise<Uint8Array> {
  return signWithSeed(requireSeed(), message);
}

/** Código de recuperación (semilla en base64url). Solo con el keystore desbloqueado. */
export function exportRecovery(): string | null {
  return unlockedSeed ? toBase64Url(unlockedSeed) : null;
}

// --- Keystore portátil (fichero USB) --------------------------------------------------
//
// El keystore YA está cifrado con la passphrase, así que su blob es seguro de exportar a
// un fichero (p. ej. en un USB). Dos usos:
//   - Modo portátil: en un equipo no confiable, se carga el fichero, se desbloquea a
//     memoria y NO se persiste nada localmente → al cerrar no queda rastro en el PC.
//   - Provisión: en un equipo propio nuevo, se importa el fichero a IndexedDB y luego se
//     desbloquea como siempre.

const PORTABLE_FORMAT = "aegis-keystore";

/** Estructura serializable del keystore (bytes en base64url) para guardar en fichero. */
interface PortableKeystore {
  format: typeof PORTABLE_FORMAT;
  v: 1;
  publicKey: string;
  vault: { v: 1; kdf: { t: number; m: number; p: number }; salt: string; iv: string; ct: string };
}

function serialize(rec: KeystoreRecord): string {
  const portable: PortableKeystore = {
    format: PORTABLE_FORMAT,
    v: 1,
    publicKey: toBase64Url(rec.publicKey),
    vault: {
      v: 1,
      kdf: rec.vault.kdf,
      salt: toBase64Url(rec.vault.salt),
      iv: toBase64Url(rec.vault.iv),
      ct: toBase64Url(rec.vault.ct),
    },
  };
  return JSON.stringify(portable, null, 2);
}

function parse(json: string): KeystoreRecord {
  let raw: PortableKeystore;
  try {
    raw = JSON.parse(json) as PortableKeystore;
  } catch {
    throw new Error("El fichero no es un keystore de Aegis válido.");
  }
  if (raw?.format !== PORTABLE_FORMAT || !raw.vault || !raw.publicKey) {
    throw new Error("El fichero no es un keystore de Aegis válido.");
  }
  const publicKey = fromBase64Url(raw.publicKey);
  const salt = fromBase64Url(raw.vault.salt);
  const iv = fromBase64Url(raw.vault.iv);
  const ct = fromBase64Url(raw.vault.ct);
  if (publicKey.length !== 32) throw new Error("Keystore corrupto (clave pública inválida).");
  return { vault: { v: 1, kdf: raw.vault.kdf, salt, iv, ct }, publicKey };
}

/** Serializa el keystore de este dispositivo a texto para guardarlo en un fichero (USB). */
export async function exportKeystore(): Promise<string> {
  const rec = await loadRecord();
  if (!rec || isLegacy(rec)) throw new Error("No hay un keystore cifrado que exportar.");
  return serialize(rec);
}

/**
 * Desbloquea el keystore desde un fichero (USB) con la passphrase.
 * `persist: false` (por defecto) = modo portátil: la semilla solo va a memoria, no se
 * escribe nada en este equipo. `persist: true` = además guarda el keystore en IndexedDB.
 */
export async function unlockFromFile(
  json: string,
  passphrase: string,
  opts: { persist?: boolean } = {},
): Promise<IdentityInfo> {
  const rec = parse(json);
  const seed = await openSeed(rec.vault, passphrase); // lanza si la passphrase es incorrecta
  const publicKey = await publicKeyFromSeed(seed);
  if (toBase64Url(publicKey) !== toBase64Url(rec.publicKey)) {
    throw new Error("El keystore está corrupto (la clave no coincide).");
  }
  if (opts.persist) {
    await tx("readwrite", (s) => s.put(rec satisfies KeystoreRecord, KEY));
  }
  setUnlocked(seed);
  return info(publicKey);
}

// --- Acuerdo de claves X25519 (requieren keystore desbloqueado) -----------------------

/** Clave pública X25519 de esta identidad (para publicarla como prekey). */
export function unlockedX25519Public(): Promise<Uint8Array> {
  return x25519PublicFromSeed(requireSeed());
}

/** Prekey X25519 + su firma Ed25519, listas para publicar en el directorio del relay. */
export function buildSignedPrekey(): Promise<{ x25519PublicKey: Uint8Array; signature: Uint8Array }> {
  return buildPrekey(requireSeed());
}

/** Secreto compartido (ECDH) con la prekey X25519 de un peer. El relay nunca lo ve. */
export function sharedSecretWithPeer(peerX25519PublicKey: Uint8Array): Promise<Uint8Array> {
  return sharedSecretWith(requireSeed(), peerX25519PublicKey);
}

// --- Mensajería sealed-sender (requieren keystore desbloqueado) -----------------------
//
// Se envuelven aquí para que la semilla NUNCA salga de este módulo: el sobre se sella/abre
// con la semilla en memoria y solo cruzan la frontera bytes ya cifrados o ya verificados.

/** Sella un mensaje para un peer con la identidad desbloqueada. Devuelve el sobre opaco. */
export function sealMessageFor(params: {
  recipientEd25519Pub: Uint8Array; // identidad del destinatario (ata la firma)
  recipientX25519Pub: Uint8Array; // prekey X25519 del destinatario (ya VERIFICADA)
  message: OutgoingMessage;
}): Promise<Uint8Array> {
  return sealEnvelope({ senderSeed: requireSeed(), ...params });
}

/** Abre un sobre recibido con la identidad desbloqueada. Verifica la firma del remitente. */
export async function openMessageBlob(blob: Uint8Array): Promise<IncomingMessage> {
  const seed = requireSeed();
  const recipientEd25519Pub = await publicKeyFromSeed(seed);
  return openEnvelope({ recipientSeed: seed, recipientEd25519Pub, blob });
}
