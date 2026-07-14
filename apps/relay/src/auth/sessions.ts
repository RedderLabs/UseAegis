// Repositorio de sesiones. Tras un challenge verificado se emite un token de sesión:
// un secreto aleatorio que solo ve el cliente. En la BBDD guardamos únicamente su
// SHA-256, así una filtración de la tabla no permite suplantar sesiones.
import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { randomToken, sha256, toBase64Url } from "./ed25519";

export interface SessionRow {
  id: string;
  public_key: Buffer;
  token_hash: Buffer;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
}

export interface IssuedSession {
  /** Token en claro (bearer). Solo se devuelve aquí, en el momento de emisión. */
  token: string;
  expiresAt: Date;
  sessionId: string;
}

/**
 * Emite una sesión para `publicKey`. Genera un token de 32 bytes, guarda su hash y
 * devuelve el token en claro exactamente una vez.
 */
export async function issueSession(
  publicKey: Buffer,
  ttlSeconds: number,
  userAgent: string | null,
  client: PoolClient | null = null,
): Promise<IssuedSession> {
  const runner = client ?? pool;
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const { rows } = await runner.query<Pick<SessionRow, "id" | "expires_at">>(
    `INSERT INTO auth_sessions (public_key, token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4)
     RETURNING id, expires_at`,
    [publicKey, tokenHash, String(ttlSeconds), userAgent],
  );
  const row = rows[0]!;
  return {
    token: toBase64Url(raw),
    expiresAt: row.expires_at,
    sessionId: row.id,
  };
}

/**
 * Resuelve un bearer token a su sesión activa (no revocada, no expirada) y refresca
 * `last_used_at`. Devuelve null si el token no corresponde a ninguna sesión válida.
 */
export async function resolveSession(rawToken: Buffer): Promise<SessionRow | null> {
  const tokenHash = sha256(rawToken);
  const { rows } = await pool.query<SessionRow>(
    `UPDATE auth_sessions
        SET last_used_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()
    RETURNING id, public_key, token_hash, created_at, last_used_at, expires_at, revoked_at, user_agent`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Revoca una sesión por su token (logout). Devuelve true si había una sesión activa. */
export async function revokeSession(rawToken: Buffer): Promise<boolean> {
  const tokenHash = sha256(rawToken);
  const { rowCount } = await pool.query(
    `UPDATE auth_sessions
        SET revoked_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL`,
    [tokenHash],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Borra sesiones ya inservibles: las expiradas, y las revocadas hace más de un día
 * (se conservan un tiempo por si interesa auditarlas). Mantenimiento periódico.
 */
export async function deleteDeadSessions(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM auth_sessions
      WHERE expires_at < now()
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '1 day')`,
  );
  return rowCount ?? 0;
}
