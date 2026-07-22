// Rastreo en Postgres de los objetos de media (el contenido vive en el bucket S3, ver s3.ts).
//
// Esta capa solo lleva la cuenta de qué `object_key` existen y cuándo expiran, para el barrido
// TTL y para validar la descarga. NO guarda remitente/destinatario (sealed-sender: el relay no
// correlaciona subida↔descarga por aquí).
import { pool } from "../db/pool";

/** Registra un objeto recién subido y devuelve su `object_key` (uuid, la capability). */
export async function insertMediaObject(sizeBytes: number, ttlSeconds: number): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const { rows } = await pool.query<{ object_key: string }>(
    `INSERT INTO media_objects (size_bytes, created_at, expires_at)
       VALUES ($1, $2, $3)
     RETURNING object_key`,
    [sizeBytes, now, expiresAt],
  );
  const key = rows[0]?.object_key;
  if (!key) throw new Error("insertMediaObject: INSERT no devolvió object_key");
  return key;
}

/** True si el objeto existe y no ha expirado (autoriza la descarga). */
export async function mediaObjectExists(objectKey: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM media_objects WHERE object_key = $1 AND expires_at > now()`,
    [objectKey],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Devuelve las `object_key` de los objetos vencidos (para borrarlos del bucket) y borra sus filas.
 * Se hace en dos pasos —RETURNING sobre el DELETE— para que el barrido pueda purgar el bucket con
 * las keys devueltas. Best-effort: si el borrado del bucket falla, la fila ya no está (se acepta
 * el objeto huérfano; el bucket puede tener su propia lifecycle rule como red de seguridad).
 */
export async function deleteExpiredMediaObjects(limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ object_key: string }>(
    `DELETE FROM media_objects
      WHERE object_key IN (
        SELECT object_key FROM media_objects WHERE expires_at <= now() LIMIT $1
      )
     RETURNING object_key`,
    [limit],
  );
  return rows.map((r) => r.object_key);
}
