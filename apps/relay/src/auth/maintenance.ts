// Tarea de mantenimiento en proceso: barre periódicamente los challenges y sesiones
// vencidas para que las tablas no crezcan sin límite. Ligera y best-effort — si un
// barrido falla se registra y se reintenta en el siguiente tick.
import type { FastifyBaseLogger } from "fastify";
import { deleteExpiredChallenges } from "./challenges";
import { deleteDeadSessions } from "./sessions";
import { deleteExpiredBlobs } from "../messaging/blobs";

export interface Maintenance {
  stop: () => void;
  /** Ejecuta un barrido inmediato (usado también por los tests). */
  runOnce: () => Promise<{ challenges: number; sessions: number; blobs: number }>;
}

export function startMaintenance(
  logger: FastifyBaseLogger,
  intervalSeconds: number,
): Maintenance {
  async function runOnce() {
    const challenges = await deleteExpiredChallenges();
    const sessions = await deleteDeadSessions();
    const blobs = await deleteExpiredBlobs();
    if (challenges > 0 || sessions > 0 || blobs > 0) {
      logger.info({ challenges, sessions, blobs }, "mantenimiento: filas vencidas borradas");
    }
    return { challenges, sessions, blobs };
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
