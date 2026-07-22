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
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { MediaConfig } from "../config";
import { requireSession } from "../plugins/authenticate";
import { deleteObject, getObject, putObject } from "./s3";
import { insertMediaObject, mediaObjectExists } from "./store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MediaRoutesOptions {
  rateLimit: { windowMs: number; messaging: number };
  media: MediaConfig | null;
  maxBytes: number;
  ttlSeconds: number;
}

export const mediaRoutes: FastifyPluginAsync<MediaRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const perRoute = {
    rateLimit: { max: opts.rateLimit.messaging, timeWindow: opts.rateLimit.windowMs },
  };

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
      // Registrar primero (obtiene la key) y subir después. Si la subida falla, la fila queda
      // huérfana pero la barrerá el TTL; nunca al revés (objeto sin fila = inaccesible + no GC).
      const key = await insertMediaObject(body.length, opts.ttlSeconds);
      try {
        await putObject(opts.media, key, body);
      } catch (err) {
        request.log.error(err, "fallo subiendo objeto de media al bucket");
        return reply.code(502).send({ error: "storage_upload_failed" });
      }
      return reply.code(201).send({ key });
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
