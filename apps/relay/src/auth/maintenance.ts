// Tarea de mantenimiento en proceso: barre periódicamente los challenges y sesiones
// vencidas para que las tablas no crezcan sin límite. Ligera y best-effort — si un
// barrido falla se registra y se reintenta en el siguiente tick.
import type { FastifyBaseLogger } from "fastify";
import { deleteExpiredChallenges } from "./challenges";
import { deleteDeadSessions } from "./sessions";

export interface Maintenance {
  stop: () => void;
  /** Ejecuta un barrido inmediato (usado también por los tests). */
  runOnce: () => Promise<{ challenges: number; sessions: number }>;
}

export function startMaintenance(
  logger: FastifyBaseLogger,
  intervalSeconds: number,
): Maintenance {
  async function runOnce() {
    const challenges = await deleteExpiredChallenges();
    const sessions = await deleteDeadSessions();
    if (challenges > 0 || sessions > 0) {
      logger.info({ challenges, sessions }, "mantenimiento: filas vencidas borradas");
    }
    return { challenges, sessions };
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
