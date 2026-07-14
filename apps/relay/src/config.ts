// Configuración del relay leída del entorno. En dev las variables las inyecta
// `dotenv-cli` (ver scripts de package.json); en producción vienen del entorno real.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`La variable ${name} debe ser un entero positivo, no "${raw}"`);
  }
  return parsed;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  host: process.env.HOST ?? "127.0.0.1",
  port: intFromEnv("PORT", 8443),
  logLevel: process.env.LOG_LEVEL ?? "info",
  // Vida de una sesión emitida tras el challenge-response.
  sessionTtlSeconds: intFromEnv("SESSION_TTL_SECONDS", 60 * 60 * 24 * 30),
  // Vida de un challenge antes de expirar.
  challengeTtlSeconds: intFromEnv("CHALLENGE_TTL_SECONDS", 120),
  // Rate-limiting por IP. Los endpoints de auth son abusables (creación de challenges
  // sin autenticar, y /verify es un oráculo de firma), así que llevan límites más
  // estrictos que el global.
  rateLimit: {
    windowMs: intFromEnv("RL_WINDOW_MS", 60_000),
    global: intFromEnv("RL_GLOBAL_MAX", 120),
    challenge: intFromEnv("RL_CHALLENGE_MAX", 15),
    verify: intFromEnv("RL_VERIFY_MAX", 30),
    // Directorio: publicar handle/prekey y, sobre todo, resolver handles. El GET de
    // resolución es enumerable, así que lleva su propio cubo (más holgado que verify
    // pero acotado) para dificultar el raspado del padrón de usuarios.
    directory: intFromEnv("RL_DIRECTORY_MAX", 60),
  },
  // Cada cuánto barre la tarea de mantenimiento challenges/sesiones vencidas.
  maintenanceIntervalSeconds: intFromEnv("MAINTENANCE_INTERVAL_SECONDS", 300),
  // Orígenes permitidos por CORS. Si se define CORS_ORIGINS (coma-separado) se usa esa
  // lista estricta; si no, `null` → en dev se permite cualquier localhost/127.0.0.1
  // (puerto variable de Next: 3000, 3001, …). Ver server.ts.
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : null,
} as const;

export type Config = typeof config;

/** Overrides de rate-limit que aceptan buildServer/tests (todos opcionales). */
export interface RateLimitOverrides {
  windowMs?: number;
  global?: number;
  challenge?: number;
  verify?: number;
  directory?: number;
}
