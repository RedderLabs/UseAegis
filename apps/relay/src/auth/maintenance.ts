// Tarea de mantenimiento en proceso: barre periódicamente los challenges y sesiones
// vencidas para que las tablas no crezcan sin límite. Ligera y best-effort — si un
// barrido falla se registra y se reintenta en el siguiente tick.
import type { FastifyBaseLogger } from "fastify";
import { deleteExpiredChallenges } from "./challenges";
import { deleteDeadSessions } from "./sessions";
import { deleteExpiredBlobs } from "../messaging/blobs";
import { config } from "../config";
import { deleteExpiredMediaObjects } from "../media/store";
import { purgeMediaFromBucket } from "../media/routes";
import { deleteExpiredUsage } from "../media/quota";

// Cuántos objetos de media caducados barre por tick (acotado: cada borrado es una llamada al
// bucket; se drena en varios ticks si hay acumulación).
const MEDIA_SWEEP_LIMIT = 100;

export interface Maintenance {
  stop: () => void;
  /** Ejecuta un barrido inmediato (usado también por los tests). */
  runOnce: () => Promise<{
    challenges: number;
    sessions: number;
    blobs: number;
    media: number;
    quota: number;
  }>;
}

export function startMaintenance(
  logger: FastifyBaseLogger,
  intervalSeconds: number,
): Maintenance {
  async function runOnce() {
    const challenges = await deleteExpiredChallenges();
    const sessions = await deleteDeadSessions();
    const blobs = await deleteExpiredBlobs();
    // Media: borra primero las filas vencidas (devuelve sus keys) y luego purga el bucket. Si el
    // almacén no está configurado, no hay filas de media que barrer (nadie pudo subir).
    let media = 0;
    if (config.media) {
      const expiredKeys = await deleteExpiredMediaObjects(MEDIA_SWEEP_LIMIT);
      media = expiredKeys.length;
      if (expiredKeys.length > 0) {
        await purgeMediaFromBucket(config.media, expiredKeys, (err, key) =>
          logger.error({ err, key }, "no se pudo purgar el objeto de media del bucket"),
        );
      }
    }
    // Cuota: liberar los cubos de uso ya vencidos. Es lo que hace que la cuota "se libere sola"
    // (la fecha que la UI le promete al usuario). Un DELETE, sin llamadas al bucket. Usa el mismo
    // TTL que la media, expresado en días enteros porque los cubos son DATE.
    let quota = 0;
    if (config.quota) {
      quota = await deleteExpiredUsage(Math.max(1, Math.ceil(config.mediaTtlSeconds / 86_400)));
    }
    if (challenges > 0 || sessions > 0 || blobs > 0 || media > 0 || quota > 0) {
      logger.info(
        { challenges, sessions, blobs, media, quota },
        "mantenimiento: filas vencidas borradas",
      );
    }
    return { challenges, sessions, blobs, media, quota };
  }

  const timer = setInterval(() => {
    runOnce().catch((err) => logger.error(err, "fallo en el barrido de mantenimiento"));
  }, intervalSeconds * 1000);

  // No debe mantener vivo el proceso por sí solo.
  timer.unref();

  return {
    stop: () => clearInterval(timer),
    runOnce,
  };
}
