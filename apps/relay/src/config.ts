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

/**
 * Igual que `intFromEnv` pero admite 0 (los toggles de cuota usan 0 = desactivado). Se mantienen
 * separadas para que el resto de variables sigan rechazando el 0 como error de configuración.
 */
function intFromEnvAllowZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`La variable ${name} debe ser un entero >= 0, no "${raw}"`);
  }
  return parsed;
}

/** Cuota de almacenamiento por identidad. `null` si está desactivada (QUOTA_MAX_BYTES=0). */
export interface QuotaConfig {
  /** Cuota de una identidad recién creada. */
  baseBytes: number;
  /** Cuota de una identidad ya madura. */
  maxBytes: number;
  /** Días que tarda en pasar de `baseBytes` a `maxBytes`. */
  rampDays: number;
  /** Suelo del tope de ráfaga diaria. */
  dailyMinBytes: number;
}

/**
 * Lee la config de cuota. Con `QUOTA_MAX_BYTES=0` devuelve null → sin techo por identidad (para un
 * relay autoalojado donde el disco es del propio usuario). Igual que la media, es una capacidad
 * opcional del despliegue; en el relay público SIEMPRE debe estar activa (ver §1 del diseño: sin
 * ella, una sola identidad autenticada puede subir del orden de 8 TiB/día).
 */
function readQuotaConfig(): QuotaConfig | null {
  const maxBytes = intFromEnvAllowZero("QUOTA_MAX_BYTES", 1024 * 1024 * 1024); // 1 GB
  if (maxBytes === 0) return null;
  const baseBytes = Math.min(
    intFromEnvAllowZero("QUOTA_BASE_BYTES", 100 * 1024 * 1024), // 100 MB
    maxBytes,
  );
  return {
    baseBytes,
    maxBytes,
    rampDays: intFromEnv("QUOTA_RAMP_DAYS", 30),
    dailyMinBytes: intFromEnvAllowZero("QUOTA_DAILY_MIN_BYTES", 100 * 1024 * 1024),
  };
}

/** Config del almacén de objetos S3-compatible. `null` si no está configurado (media off). */
export interface MediaConfig {
  endpoint: string; // p.ej. https://s3.us-east-005.backblazeb2.com
  region: string; // p.ej. us-east-005
  bucket: string;
  accessKey: string;
  secretKey: string;
}

/**
 * Lee la config S3 del entorno. Todo-o-nada: si están las 5 variables, devuelve la config;
 * si falta alguna, devuelve null (media deshabilitada). No lanza: la media es opcional y el
 * relay debe arrancar sin ella (los endpoints /media responderán 503).
 */
function readMediaConfig(): MediaConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !region || !bucket || !accessKey || !secretKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""), // sin barra final
    region,
    bucket,
    accessKey,
    secretKey,
  };
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  // Conexión a DragonflyDB (Redis-compatible) para el pub/sub del push en tiempo real. OPCIONAL:
  // sin ella, los avisos SSE funcionan solo en proceso (correcto con una única instancia).
  redisUrl: process.env.REDIS_URL ?? null,
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
    // Mensajería: enviar/recibir sobres. Más holgado (una conversación activa hace muchas
    // peticiones), pero acotado para frenar el flooding de buzones.
    messaging: intFromEnv("RL_MESSAGING_MAX", 120),
  },
  // TTL de los sobres en el buzón. Se retienen (no se borran al entregar) para la continuidad
  // de conversación entre puertas; el barrido de mantenimiento borra los vencidos.
  blobTtlSeconds: intFromEnv("BLOB_TTL_SECONDS", 60 * 60 * 24 * 30),
  // Almacenamiento de OBJETOS (S3-compatible: Backblaze B2, Cloudflare R2, AWS S3, MinIO) para
  // los adjuntos cifrados grandes (audio/archivos), que no caben en el buzón inline de 64 KiB.
  // Es OPCIONAL: si falta cualquiera de las 5 variables, `media` es null y las rutas /media
  // responden 503 (el relay arranca igual, solo sin adjuntos). Ver src/media/.
  media: readMediaConfig(),
  // Tope de tamaño de un objeto de media (ciphertext ya cifrado, base64 NO — va binario). 50 MiB.
  mediaMaxBytes: intFromEnv("MEDIA_MAX_BYTES", 50 * 1024 * 1024),
  // TTL de los objetos de media en el bucket + su fila de rastreo. Igual que el buzón por defecto.
  mediaTtlSeconds: intFromEnv("MEDIA_TTL_SECONDS", 60 * 60 * 24 * 30),
  // Techo de almacenamiento POR IDENTIDAD (bytes en reposo), que madura con la edad de la cuenta.
  // Sin esto, MEDIA_MAX_BYTES × RL_MESSAGING_MAX deja subir ~8 TiB/día a una sola identidad.
  quota: readQuotaConfig(),
  // Cada cuánto barre la tarea de mantenimiento challenges/sesiones/sobres vencidos.
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
  messaging?: number;
}
