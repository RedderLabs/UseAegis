// Rutas de MEDIA (adjuntos cifrados grandes: audio/archivos) — Modo A, proxy al bucket S3.
//
// El relay hace de PROXY entre el cliente y el bucket: el cliente solo habla con el relay (mismo
// origen, sigue la puerta clearnet/.onion), nunca con B2 directamente (evita fuga de metadatos a
// un tercero desde .onion). El cuerpo ya viaja cifrado E2E (AEAD por chunks con clave aleatoria
// que va dentro del sobre sealed-sender); para el relay y el bucket es un blob opaco.
//
//   POST   /media          (bytes crudos)  → sube el ciphertext, devuelve { key }
//   GET    /media/:key                     → descarga el ciphertext (stream)
//
// Ambas requieren sesión (anti-abuso) + rate-limit. Si el almacén no está configurado (faltan las
// variables S3_*), responden 503: la media es una capacidad opcional del despliegue.
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import type { MediaConfig, QuotaConfig } from "../config";
import { requireSession } from "../plugins/authenticate";
import { deleteObject, getObject, putObject } from "./s3";
import { insertMediaObject, mediaObjectExists } from "./store";
import { debitStorage, getQuotaState, refundStorage } from "./quota";
import type { QuotaState } from "./quota";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MediaRoutesOptions {
  rateLimit: { windowMs: number; messaging: number };
  media: MediaConfig | null;
  maxBytes: number;
  ttlSeconds: number;
  /** Techo por identidad. `null` = sin cuota (relay autoalojado). */
  quota: QuotaConfig | null;
}

/**
 * Cabeceras de cuota en toda respuesta de subida, para que el cliente pinte la barra de uso sin
 * tener que hacer una segunda petición.
 */
function applyQuotaHeaders(reply: FastifyReply, state: QuotaState): void {
  reply.header("x-aegis-quota-bytes", String(state.quota));
  reply.header("x-aegis-quota-used", String(state.used));
  if (state.freesAt) reply.header("x-aegis-quota-frees-at", state.freesAt);
}

/** Segundos hasta la próxima medianoche UTC — cuando se reinicia el cubo diario (CURRENT_DATE). */
function secondsUntilNextDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export const mediaRoutes: FastifyPluginAsync<MediaRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const perRoute = {
    rateLimit: { max: opts.rateLimit.messaging, timeWindow: opts.rateLimit.windowMs },
  };
  // La contabilidad de cuota va por días enteros (cubos DATE), el TTL viene en segundos.
  const ttlDays = Math.max(1, Math.ceil(opts.ttlSeconds / 86_400));

  // Parser de cuerpo binario SOLO en este contexto de plugin (Fastify encapsula los parsers por
  // plugin, así que no afecta al JSON del resto del relay). Recolecta el ciphertext como Buffer.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: opts.maxBytes },
    (_req, body, done) => done(null, body),
  );

  // 1) Subir un objeto cifrado. Devuelve la capability (uuid) para referenciarlo en el sobre.
  app.post(
    "/media",
    {
      preHandler: requireSession,
      bodyLimit: opts.maxBytes,
      config: perRoute,
    },
    async (request, reply) => {
      if (!opts.media) return reply.code(503).send({ error: "media_unconfigured" });
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      if (body.length > opts.maxBytes) {
        return reply.code(413).send({ error: "media_too_large" });
      }

      // Cuota por identidad. Se cobra ANTES de tocar el bucket, contra la sesión autenticada —
      // el mismo patrón que el chequeo de bloqueos al enviar: el relay conoce al que sube en el
      // momento de subir, aunque el sobre almacenado sea sealed-sender. Lo que se persiste es solo
      // un agregado por día (ver quota.ts), no la relación identidad↔objeto.
      const identity = request.identity!.publicKey;
      const charged = opts.quota ? body.length : 0;
      if (opts.quota) {
        const debit = await debitStorage(identity, body.length, opts.quota, ttlDays);
        applyQuotaHeaders(reply, debit.state);
        if (!debit.ok) {
          // 507 = no cabe en el techo en reposo; 429 = cabe, pero hoy ya ha subido demasiado.
          // En ninguno de los dos casos se toca nada de lo ya enviado: el texto sigue igual.
          if (debit.reason === "quota_exceeded") {
            return reply.code(507).send({
              error: "quota_exceeded",
              quota: debit.state.quota,
              used: debit.state.used,
              freesAt: debit.state.freesAt,
              freesBytes: debit.state.freesBytes,
            });
          }
          const retryAfter = secondsUntilNextDay(new Date());
          reply.header("retry-after", String(retryAfter));
          return reply.code(429).send({
            error: "daily_limit",
            dailyLimit: debit.state.dailyLimit,
            dailyUsed: debit.state.dailyUsed,
            retryAfter,
          });
        }
      }

      // Registrar primero (obtiene la key) y subir después. Si la subida falla, la fila queda
      // huérfana pero la barrerá el TTL; nunca al revés (objeto sin fila = inaccesible + no GC).
      const key = await insertMediaObject(body.length, opts.ttlSeconds);
      try {
        await putObject(opts.media, key, body);
      } catch (err) {
        request.log.error(err, "fallo subiendo objeto de media al bucket");
        // El objeto nunca llegó al bucket: devolver los bytes ya cobrados, o el usuario pagaría
        // cuota por un fallo del servidor. Best-effort; si el reembolso falla, el cubo caduca solo.
        if (charged > 0) {
          await refundStorage(identity, charged).catch((refundErr) =>
            request.log.error(refundErr, "fallo reembolsando la cuota tras un error de subida"),
          );
        }
        return reply.code(502).send({ error: "storage_upload_failed" });
      }
      return reply.code(201).send({ key });
    },
  );

  // 1-bis) Estado de cuota, para la barra de uso y para avisar ANTES de grabar un audio de 40 MB.
  //        Ruta estática: Fastify la resuelve con prioridad sobre la paramétrica /media/:key.
  app.get(
    "/media/quota",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      if (!opts.media) return reply.code(503).send({ error: "media_unconfigured" });
      if (!opts.quota) return reply.send({ enabled: false });
      const state = await getQuotaState(request.identity!.publicKey, opts.quota, ttlDays);
      applyQuotaHeaders(reply, state);
      return reply.send({ enabled: true, ...state });
    },
  );

  // 2) Descargar un objeto cifrado. La key es una capability; requiere sesión + que la fila exista
  //    y no haya expirado. Reenvía el stream del bucket sin cargarlo entero en memoria.
  app.get<{ Params: { key: string } }>(
    "/media/:key",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      if (!opts.media) return reply.code(503).send({ error: "media_unconfigured" });
      const { key } = request.params;
      if (!UUID_RE.test(key)) return reply.code(400).send({ error: "invalid_key" });
      if (!(await mediaObjectExists(key))) return reply.code(404).send({ error: "not_found" });
      try {
        const { body, contentLength } = await getObject(opts.media, key);
        reply.header("content-type", "application/octet-stream");
        if (contentLength !== null) reply.header("content-length", String(contentLength));
        return reply.send(Readable.fromWeb(body));
      } catch (err) {
        request.log.error(err, "fallo descargando objeto de media del bucket");
        return reply.code(502).send({ error: "storage_download_failed" });
      }
    },
  );
};

/** Purga del bucket los objetos cuyas filas ya barrió el TTL (best-effort, uno a uno). */
export async function purgeMediaFromBucket(
  media: MediaConfig,
  keys: string[],
  onError: (err: unknown, key: string) => void,
): Promise<void> {
  for (const key of keys) {
    try {
      await deleteObject(media, key);
    } catch (err) {
      onError(err, key);
    }
  }
}
