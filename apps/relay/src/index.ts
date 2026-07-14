// Entrypoint del relay: arranca el servidor y gestiona el apagado limpio.
import { buildServer } from "./server";
import { config } from "./config";
import { closePool } from "./db/pool";
import { startMaintenance } from "./auth/maintenance";

async function main(): Promise<void> {
  const app = buildServer();

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    await closePool();
    process.exit(1);
  }

  // Barrido periódico de challenges/sesiones vencidas.
  const maintenance = startMaintenance(app.log, config.maintenanceIntervalSeconds);

  // Apagado limpio: cierra Fastify y el pool de PostgreSQL ante SIGINT/SIGTERM.
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "cerrando relay…");
    try {
      maintenance.stop();
      await app.close();
      await closePool();
      process.exit(0);
    } catch (err) {
      app.log.error(err, "error durante el apagado");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
