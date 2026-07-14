// Repositorio de challenges del handshake de autenticación.
//
// Flujo: el cliente pide un challenge para su clave pública → el relay guarda un nonce
// aleatorio con expiración corta → el cliente firma el nonce y lo canjea en /auth/verify.
// Cada challenge es de un solo uso (consumed_at).
import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { randomToken } from "./ed25519";

export interface ChallengeRow {
  id: string;
  public_key: Buffer;
  nonce: Buffer;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
}

/** Prefijo de dominio que se antepone al nonce antes de firmar/verificar (RFC-style
 *  domain separation): evita que una firma hecha aquí sea reutilizable en otro contexto. */
export const AUTH_DOMAIN = Buffer.from("aegis-auth:v1:", "utf8");

/** Mensaje canónico que el cliente debe firmar: dominio || nonce. */
export function challengeMessage(nonce: Buffer): Buffer {
  return Buffer.concat([AUTH_DOMAIN, nonce]);
}

/** Crea un challenge nuevo para `publicKey`, válido durante `ttlSeconds`. */
export async function createChallenge(
  publicKey: Buffer,
  ttlSeconds: number,
): Promise<ChallengeRow> {
  const nonce = randomToken(32);
  const { rows } = await pool.query<ChallengeRow>(
    `INSERT INTO auth_challenges (public_key, nonce, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
     RETURNING id, public_key, nonce, created_at, expires_at, consumed_at`,
    [publicKey, nonce, String(ttlSeconds)],
  );
  return rows[0]!;
}

/**
 * Marca un challenge como consumido de forma atómica y devuelve su fila, pero solo si
 * sigue vivo (no consumido y no expirado). Si otra petición se adelanta, o ya venció,
 * devuelve null. El UPDATE ... WHERE evita condiciones de carrera de doble canje.
 */
export async function consumeChallenge(
  id: string,
  client: PoolClient | null = null,
): Promise<ChallengeRow | null> {
  const runner = client ?? pool;
  const { rows } = await runner.query<ChallengeRow>(
    `UPDATE auth_challenges
        SET consumed_at = now()
      WHERE id = $1
        AND consumed_at IS NULL
        AND expires_at > now()
    RETURNING id, public_key, nonce, created_at, expires_at, consumed_at`,
    [id],
  );
  return rows[0] ?? null;
}

/** Borra challenges vencidos (mantenimiento; se podrá programar más adelante). */
export async function deleteExpiredChallenges(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM auth_challenges WHERE expires_at < now()`,
  );
  return rowCount ?? 0;
}
