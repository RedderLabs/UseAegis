// Repositorio del directorio de usuarios y de las prekeys X25519.
//
// El relay guarda, por identidad, un handle opcional (para buscarse) y la prekey X25519
// firmada (para acordar clave). Nunca guarda secretos ni el grafo social. Ver la
// migración 1731100000000_directory-and-keys.sql y docs/THREAT_MODEL.md.
import { pool } from "../db/pool";
import { toBase64Url } from "../auth/ed25519";

/** Handle válido: 3–20 chars, minúsculas/dígitos/guion bajo. Igual que el CHECK de la BBDD. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Normaliza lo que teclea el usuario a la forma canónica (minúsculas, sin espacios). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Vista pública de una identidad en el directorio (nunca incluye material secreto). */
export interface DirectoryEntry {
  publicKey: string; // Ed25519 (base64url) — la identidad
  fingerprint: string;
  username: string | null;
  /** Prekey X25519 firmada, o null si el usuario aún no publicó una. */
  keyBundle: {
    x25519PublicKey: string; // base64url (32 bytes)
    x25519Signature: string; // base64url (64 bytes), Ed25519 sobre dominio||prekey
    updatedAt: string; // ISO-8601
  } | null;
}

interface DirectoryRow {
  public_key: Buffer;
  fingerprint: string;
  username: string | null;
  x25519_public_key: Buffer | null;
  x25519_signature: Buffer | null;
  keys_updated_at: Date | null;
}

function toEntry(row: DirectoryRow): DirectoryEntry {
  return {
    publicKey: toBase64Url(row.public_key),
    fingerprint: row.fingerprint,
    username: row.username,
    keyBundle:
      row.x25519_public_key && row.x25519_signature && row.keys_updated_at
        ? {
            x25519PublicKey: toBase64Url(row.x25519_public_key),
            x25519Signature: toBase64Url(row.x25519_signature),
            updatedAt: row.keys_updated_at.toISOString(),
          }
        : null,
  };
}

const SELECT_COLS =
  "public_key, fingerprint, username, x25519_public_key, x25519_signature, keys_updated_at";

export type SetUsernameResult =
  | { ok: true; username: string }
  | { ok: false; reason: "username_taken" };

/**
 * Reclama o cambia el handle de una identidad. El handle es único case-insensitive; si
 * otra identidad ya lo tiene, devuelve `username_taken` (violación de índice único 23505).
 */
export async function setUsername(
  publicKey: Buffer,
  username: string,
): Promise<SetUsernameResult> {
  try {
    await pool.query(
      `UPDATE identities SET username = $2 WHERE public_key = $1`,
      [publicKey, username],
    );
    return { ok: true, username };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return { ok: false, reason: "username_taken" };
    }
    throw err;
  }
}

/** Publica (o rota) la prekey X25519 firmada de una identidad. La firma se valida en la ruta. */
export async function publishPrekey(
  publicKey: Buffer,
  x25519PublicKey: Buffer,
  signature: Buffer,
): Promise<void> {
  await pool.query(
    `UPDATE identities
        SET x25519_public_key = $2,
            x25519_signature  = $3,
            keys_updated_at   = now()
      WHERE public_key = $1`,
    [publicKey, x25519PublicKey, signature],
  );
}

/** Resuelve un handle → entrada de directorio. Búsqueda case-insensitive. null si no existe. */
export async function resolveByUsername(username: string): Promise<DirectoryEntry | null> {
  const { rows } = await pool.query<DirectoryRow>(
    `SELECT ${SELECT_COLS} FROM identities WHERE lower(username) = lower($1)`,
    [username],
  );
  return rows[0] ? toEntry(rows[0]) : null;
}

/** Devuelve la entrada de directorio (incl. key bundle) de una clave pública concreta. */
export async function getEntry(publicKey: Buffer): Promise<DirectoryEntry | null> {
  const { rows } = await pool.query<DirectoryRow>(
    `SELECT ${SELECT_COLS} FROM identities WHERE public_key = $1`,
    [publicKey],
  );
  return rows[0] ? toEntry(rows[0]) : null;
}
