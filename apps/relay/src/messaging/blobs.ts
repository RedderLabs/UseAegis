// Repositorio del buzón de mensajes (Modo A).
//
// Almacena, por identidad DESTINATARIA, sobres sealed-sender opacos (ver la migración
// 1731200000000_messaging-blobs.sql y docs/aegis-messaging-mvp.md). El relay nunca conoce al
// remitente (viaja cifrado dentro del payload) ni el contenido. Los sobres se retienen bajo TTL.
import { pool } from "../db/pool";
import { toBase64Url } from "../auth/ed25519";

/** Sobre almacenado tal como se devuelve al destinatario (payload en base64url). */
export interface StoredBlob {
  id: string;
  blob: string; // base64url del payload (sobre opaco)
  createdAt: string; // ISO-8601
}

interface BlobRow {
  id: string;
  payload: Buffer;
  created_at: Date;
}

export type InsertResult = { ok: true } | { ok: false; reason: "recipient_not_found" };

/** Inserta un sobre para `recipient` con expiración `ttlSeconds`. */
export async function insertBlob(
  recipient: Buffer,
  payload: Buffer,
  ttlSeconds: number,
): Promise<InsertResult> {
  // created_at explícito con precisión de MILISEGUNDOS (Date de JS), no el now() de Postgres
  // (microsegundos): así el valor almacenado coincide EXACTO con el `createdAt` que devolvemos
  // (toISOString, ms), y el cursor `created_at > $after` excluye bien el registro frontera.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  try {
    await pool.query(
      `INSERT INTO messages (recipient, payload, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
      [recipient, payload, now, expiresAt],
    );
    return { ok: true };
  } catch (err) {
    // 23503 = foreign_key_violation → el destinatario no tiene identidad en el relay (no existe).
    if ((err as { code?: string }).code === "23503") {
      return { ok: false, reason: "recipient_not_found" };
    }
    throw err;
  }
}

/**
 * Sobres no expirados de un destinatario, en orden ascendente. `after` = cursor incremental
 * (solo sobres con created_at > after); null → desde el principio. `limit` acota el lote.
 */
export async function listBlobsFor(
  recipient: Buffer,
  after: Date | null,
  limit: number,
): Promise<StoredBlob[]> {
  const { rows } = await pool.query<BlobRow>(
    `SELECT id, payload, created_at
       FROM messages
      WHERE recipient = $1
        AND expires_at > now()
        AND ($2::timestamptz IS NULL OR created_at > $2)
      ORDER BY created_at ASC
      LIMIT $3`,
    [recipient, after, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    blob: toBase64Url(r.payload),
    createdAt: r.created_at.toISOString(),
  }));
}

/** Borra un sobre del buzón del propio destinatario (ack/purga). Devuelve true si borró algo. */
export async function deleteBlob(id: string, recipient: Buffer): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM messages WHERE id = $1 AND recipient = $2`,
    [id, recipient],
  );
  return (rowCount ?? 0) > 0;
}

/** Barrido TTL: borra los sobres vencidos. Devuelve cuántos borró. */
export async function deleteExpiredBlobs(): Promise<number> {
  const { rowCount } = await pool.query(`DELETE FROM messages WHERE expires_at <= now()`);
  return rowCount ?? 0;
}
