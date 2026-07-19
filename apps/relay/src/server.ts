// Construcción de la instancia Fastify del relay.
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { config } from "./config";
import type { RateLimitOverrides } from "./config";
import { authRoutes } from "./auth/routes";
import { directoryRoutes } from "./directory/routes";
import { messagingRoutes } from "./messaging/routes";
import { mediaRoutes } from "./media/routes";
import { blocksRoutes } from "./blocks/routes";
import { pool } from "./db/pool";

export interface BuildOptions {
  /** Sobreescribe los límites de rate-limit (los tests bajan los máximos para poder disparar 429). */
  rateLimit?: RateLimitOverrides;
}

export function buildServer(options: BuildOptions = {}): FastifyInstance {
  const rl = { ...config.rateLimit, ...options.rateLimit };

  const app = Fastify({
    logger: { level: config.logLevel },
    // El relay va detrás de Caddy/Tor en producción (ARQUITECTURA §4.1); confía en el proxy
    // para que request.ip use X-Forwarded-For en el rate-limit.
    trustProxy: true,
  });

  // CORS: el cliente web (otro origen) necesita poder llamar a la API de auth.
  // Con CORS_ORIGINS definido → lista estricta. Sin él (dev) → cualquier localhost,
  // sea cual sea el puerto que Next acabe usando (3000, 3001, …).
  const devLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.register(cors, {
    origin:
      config.corsOrigins ??
      ((origin, cb) => {
        // Sin Origin (curl, same-origin) o cualquier localhost → permitido en dev.
        cb(null, !origin || devLocalhost.test(origin));
      }),
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "authorization"],
  });

  // Rate-limit global por IP. Los endpoints de auth lo endurecen por ruta (ver routes.ts).
  // Se registra ANTES de las rutas para que la config por ruta surta efecto.
  app.register(rateLimit, {
    global: true,
    max: rl.global,
    timeWindow: rl.windowMs,
  });

  // Healthcheck: incluye una comprobación real de la BBDD. Exento de rate-limit.
  app.get("/health", { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return reply.send({ status: "ok", db: "up" });
    } catch {
      return reply.code(503).send({ status: "degraded", db: "down" });
    }
  });

  app.register(authRoutes, { rateLimit: rl });
  app.register(directoryRoutes, { rateLimit: rl });
  app.register(messagingRoutes, { rateLimit: rl, blobTtlSeconds: config.blobTtlSeconds });
  app.register(mediaRoutes, {
    rateLimit: rl,
    media: config.media,
    maxBytes: config.mediaMaxBytes,
    ttlSeconds: config.mediaTtlSeconds,
  });
  app.register(blocksRoutes, { rateLimit: rl });

  return app;
}
