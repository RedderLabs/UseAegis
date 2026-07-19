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

// Cuántos objetos de media caducados barre por tick (acotado: cada borrado es una llamada al
// bucket; se drena en varios ticks si hay acumulación).
const MEDIA_SWEEP_LIMIT = 100;

export interface Maintenance {
  stop: () => void;
  /** Ejecuta un barrido inmediato (usado también por los tests). */
  runOnce: () => Promise<{ challenges: number; sessions: number; blobs: number; media: number }>;
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
    if (challenges > 0 || sessions > 0 || blobs > 0 || media > 0) {
      logger.info({ challenges, sessions, blobs, media }, "mantenimiento: filas vencidas borradas");
    }
    return { challenges, sessions, blobs, media };
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
