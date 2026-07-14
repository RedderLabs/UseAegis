// Repositorio de identidades. Una identidad = una clave pública Ed25519 (32 bytes).
import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { toBase64Url } from "./ed25519";

export interface IdentityRow {
  public_key: Buffer;
  fingerprint: string;
  created_at: Date;
  last_seen_at: Date;
}

/**
 * Crea la identidad si no existe y actualiza `last_seen_at`. Idempotente.
 * Se llama tras un challenge verificado (registro perezoso en el primer login).
 */
export async function upsertIdentity(
  publicKey: Buffer,
  client: PoolClient | null = null,
): Promise<IdentityRow> {
  const runner = client ?? pool;
  const fingerprint = toBase64Url(publicKey);
  const { rows } = await runner.query<IdentityRow>(
    `INSERT INTO identities (public_key, fingerprint)
     VALUES ($1, $2)
     ON CONFLICT (public_key)
       DO UPDATE SET last_seen_at = now()
     RETURNING public_key, fingerprint, created_at, last_seen_at`,
    [publicKey, fingerprint],
  );
  return rows[0]!;
}

export async function findIdentity(publicKey: Buffer): Promise<IdentityRow | null> {
  const { rows } = await pool.query<IdentityRow>(
    `SELECT public_key, fingerprint, created_at, last_seen_at
       FROM identities
      WHERE public_key = $1`,
    [publicKey],
  );
  return rows[0] ?? null;
}
