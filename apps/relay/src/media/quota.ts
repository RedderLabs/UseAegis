// Cuota de almacenamiento por identidad (ver migrations/1731500000000_storage-quota.sql).
//
// Se mide lo que la identidad tiene ALMACENADO AHORA (bytes en reposo), no un acumulado de por
// vida. Todo caduca a los MEDIA_TTL_SECONDS (30 días por defecto), así que la cuota se libera sola:
// coincide con lo que de verdad factura el bucket ($/GB-mes) y el usuario honesto nunca topa para
// siempre. Un contador de por vida solo sube, y acabaría expulsando justo a los usuarios fieles.
//
// La cuota MADURA con la edad de la identidad. No se puede impedir que alguien cree identidades
// (son claves Ed25519 gratis, por diseño: ARQUITECTURA.md §2), pero sí que una identidad recién
// creada valga poco. Quien quiera 10 GB hoy necesita 100 identidades y aun así solo obtiene el
// tramo del día 0 en cada una; para que valgan la cuota máxima tienen que estar VIVAS 30 días. Le
// cambia el recurso barato (crear claves) por el caro (tiempo), que no se paraleliza.
//
// Efecto secundario buscado: re-registrarse con la misma frase BIP39 tras borrarse NO resetea la
// cuota al alza — el `created_at` vuelve a cero y la cuota BAJA. No es un exploit, es un castigo.
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../db/pool";
import type { QuotaConfig } from "../config";

/** Estado de cuota de una identidad, tal como lo ve la UI. */
export interface QuotaState {
  /** Tope en reposo que le corresponde por su edad, en bytes. */
  quota: number;
  /** Bytes vivos ahora mismo (suma de los cubos no vencidos). */
  used: number;
  /** Bytes subidos hoy. */
  dailyUsed: number;
  /** Tope de ráfaga diaria, en bytes. */
  dailyLimit: number;
  /** Edad de la identidad en días (de `identities.created_at`). */
  ageDays: number;
  /** Fecha (YYYY-MM-DD) en que vence el cubo más antiguo, o null si no ocupa nada. */
  freesAt: string | null;
  /** Cuántos bytes se liberan en esa fecha. */
  freesBytes: number;
}

/**
 * Cuota en reposo según la edad de la identidad: rampa lineal de `baseBytes` a `maxBytes` a lo
 * largo de `rampDays` días. El usuario honesto no la nota (nadie sube 1 GB su primer día); la
 * granja de cuentas se queda en el tramo base hasta que sus identidades cumplan un mes.
 */
export function quotaForAgeDays(cfg: QuotaConfig, ageDays: number): number {
  if (ageDays >= cfg.rampDays) return cfg.maxBytes;
  const progress = Math.max(0, ageDays) / cfg.rampDays;
  return Math.floor(cfg.baseBytes + (cfg.maxBytes - cfg.baseBytes) * progress);
}

/**
 * Tope de ráfaga diaria. Ojo: con TTL de 30 días nada se libera antes de 30 días, así que la cuota
 * en reposo YA es un tope de flujo a 30 días. Este límite no controla el disco: controla la RÁFAGA
 * y el ancho de banda del host (las descargas se proxean por el relay, no van directas al bucket).
 */
export function dailyLimitFor(cfg: QuotaConfig, quota: number): number {
  return Math.max(cfg.dailyMinBytes, Math.floor(quota / 2));
}

/** `bigint` de Postgres llega como string en node-postgres; normalizar sin perder el 0. */
function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

interface UsageRow {
  created_at: Date | null;
  used: string | null;
  today: string | null;
  oldest_day: Date | null;
  oldest_bytes: string | null;
}

const EMPTY_USAGE: UsageRow = {
  created_at: null,
  used: null,
  today: null,
  oldest_day: null,
  oldest_bytes: null,
};

/**
 * Lee edad + ocupación de una identidad en UNA consulta. El agregado sobre cero filas sigue
 * devolviendo una fila (COALESCE a 0), así que una identidad que nunca ha subido nada funciona.
 * Si se le pasa el `client` de una transacción, ve las escrituras de esa misma transacción.
 */
async function readUsage(
  identity: Buffer,
  ttlDays: number,
  client?: PoolClient,
): Promise<UsageRow> {
  const runner = client ?? pool;
  const { rows } = await runner.query<UsageRow>(
    `SELECT
       (SELECT created_at FROM identities WHERE public_key = $1)               AS created_at,
       COALESCE(SUM(bytes) FILTER (WHERE day > CURRENT_DATE - $2::int), 0)     AS used,
       COALESCE(SUM(bytes) FILTER (WHERE day = CURRENT_DATE), 0)               AS today,
       MIN(day)           FILTER (WHERE day > CURRENT_DATE - $2::int)          AS oldest_day,
       COALESCE(
         (array_agg(bytes ORDER BY day) FILTER (WHERE day > CURRENT_DATE - $2::int))[1],
         0
       )                                                                       AS oldest_bytes
     FROM storage_usage
     WHERE identity = $1`,
    [identity, ttlDays],
  );
  return rows[0] ?? EMPTY_USAGE;
}

function buildState(cfg: QuotaConfig, ttlDays: number, row: UsageRow, now: Date): QuotaState {
  // Sin created_at (no debería pasar: requireSession implica que la identidad existe) → edad 0,
  // que es el tramo más restrictivo. Fallar hacia el lado seguro.
  const ageDays = row.created_at ? daysBetween(row.created_at, now) : 0;
  const quota = quotaForAgeDays(cfg, ageDays);
  return {
    quota,
    used: toInt(row.used),
    dailyUsed: toInt(row.today),
    dailyLimit: dailyLimitFor(cfg, quota),
    ageDays,
    freesAt: row.oldest_day
      ? new Date(row.oldest_day.getTime() + ttlDays * 86_400_000).toISOString().slice(0, 10)
      : null,
    freesBytes: row.oldest_day ? toInt(row.oldest_bytes) : 0,
  };
}

/** Estado completo para `GET /media/quota` y para las cabeceras de respuesta. */
export async function getQuotaState(
  identity: Buffer,
  cfg: QuotaConfig,
  ttlDays: number,
  now: Date = new Date(),
): Promise<QuotaState> {
  return buildState(cfg, ttlDays, await readUsage(identity, ttlDays), now);
}

export type QuotaRejection = "quota_exceeded" | "daily_limit";

export type DebitResult =
  | { ok: true; state: QuotaState }
  | { ok: false; reason: QuotaRejection; state: QuotaState };

/** Sentinela interna: lanzarla hace que `withTransaction` haga ROLLBACK del débito. */
class QuotaRejected extends Error {
  constructor(readonly reason: QuotaRejection) {
    super(reason);
  }
}

/**
 * Debita `bytes` contra la cuota de la identidad. Atómico: si no cabe, hace ROLLBACK y el intento
 * no deja rastro.
 *
 * La concurrencia sale gratis: dos subidas simultáneas de la MISMA identidad chocan en el UPSERT de
 * la misma fila (identity, hoy) y se serializan solas en el lock de esa fila — sin
 * `SELECT … FOR UPDATE` y sin ventana para colar dos subidas contra la misma cuota. La transacción
 * es solo de BBDD (la subida al bucket ocurre DESPUÉS del COMMIT), así que el lock dura muy poco.
 *
 * El orden importa: primero el UPSERT (toma el lock), después la lectura del total. La lectura va
 * en la misma transacción, así que ve su propia escritura y el total es exacto.
 */
export async function debitStorage(
  identity: Buffer,
  bytes: number,
  cfg: QuotaConfig,
  ttlDays: number,
  now: Date = new Date(),
): Promise<DebitResult> {
  try {
    return await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO storage_usage (identity, day, bytes)
              VALUES ($1, CURRENT_DATE, $2)
         ON CONFLICT (identity, day)
         DO UPDATE SET bytes = storage_usage.bytes + EXCLUDED.bytes`,
        [identity, bytes],
      );
      const state = buildState(cfg, ttlDays, await readUsage(identity, ttlDays, client), now);
      if (state.used > state.quota) throw new QuotaRejected("quota_exceeded");
      if (state.dailyUsed > state.dailyLimit) throw new QuotaRejected("daily_limit");
      return { ok: true as const, state };
    });
  } catch (err) {
    if (!(err instanceof QuotaRejected)) throw err;
    // Tras el ROLLBACK, releer para devolver a la UI el estado REAL (sin el intento fallido).
    const state = buildState(cfg, ttlDays, await readUsage(identity, ttlDays), now);
    return { ok: false as const, reason: err.reason, state };
  }
}

/**
 * Devuelve los bytes cobrados cuando la subida al bucket falla después del débito. `GREATEST(…, 0)`
 * porque el barrido pudo borrar el cubo entre medias (carrera benigna a medianoche).
 */
export async function refundStorage(identity: Buffer, bytes: number): Promise<void> {
  await pool.query(
    `UPDATE storage_usage
        SET bytes = GREATEST(bytes - $2::bigint, 0)
      WHERE identity = $1 AND day = CURRENT_DATE`,
    [identity, bytes],
  );
}

/** Barre los cubos ya vencidos (la liberación de cuota). Devuelve cuántas filas borró. */
export async function deleteExpiredUsage(ttlDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM storage_usage WHERE day <= CURRENT_DATE - $1::int`,
    [ttlDays],
  );
  return rowCount ?? 0;
}
