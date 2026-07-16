// Repositorio de bloqueos de mensajería.
//
// Un bloqueo es direccional: `blocker` no acepta sobres de `blocked`. El relay guarda solo el
// par de claves públicas (ver migración 1731300000000_message-blocks.sql). `isBlocked` lo consulta
// el buzón en cada envío para descartar en silencio; el resto es la gestión del propio usuario.
import { pool } from "../db/pool";
import { toBase64Url } from "../auth/ed25519";

/** Una entrada de la lista de bloqueados (clave pública del bloqueado + cuándo se bloqueó). */
export interface BlockedEntry {
  publicKey: string; // Ed25519 (base64url) del bloqueado
  createdAt: string; // ISO-8601
}

/** Añade un bloqueo (idempotente: si ya existe, no hace nada). */
export async function addBlock(blocker: Buffer, blocked: Buffer): Promise<void> {
  await pool.query(
    `INSERT INTO message_blocks (blocker, blocked) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [blocker, blocked],
  );
}

/** Quita un bloqueo. Devuelve true si había algo que quitar. */
export async function removeBlock(blocker: Buffer, blocked: Buffer): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM message_blocks WHERE blocker = $1 AND blocked = $2`,
    [blocker, blocked],
  );
  return (rowCount ?? 0) > 0;
}

/** Lista los bloqueos de una identidad, del más reciente al más antiguo. */
export async function listBlocks(blocker: Buffer): Promise<BlockedEntry[]> {
  const { rows } = await pool.query<{ blocked: Buffer; created_at: Date }>(
    `SELECT blocked, created_at FROM message_blocks WHERE blocker = $1 ORDER BY created_at DESC`,
    [blocker],
  );
  return rows.map((r) => ({ publicKey: toBase64Url(r.blocked), createdAt: r.created_at.toISOString() }));
}

/** ¿`blocker` ha bloqueado a `blocked`? Lo consulta el buzón en cada envío. */
export async function isBlocked(blocker: Buffer, blocked: Buffer): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM message_blocks WHERE blocker = $1 AND blocked = $2 LIMIT 1`,
    [blocker, blocked],
  );
  return (rowCount ?? 0) > 0;
}
