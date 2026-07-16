// Rutas del buzón de mensajes (Modo A).
//
// Todas requieren sesión (bearer). Sealed sender: al ENVIAR, el remitente está autenticado
// (anti-spam) pero NO se almacena junto al sobre; la identidad del remitente viaja cifrada
// dentro del payload. Al RECIBIR, el destinatario es la identidad de la propia sesión.
//
//   POST   /messages/:recipient   { blob }        → deja un sobre en el buzón del destinatario
//   GET    /messages?after=<ISO>                  → recupera los sobres del propio buzón (cursor)
//   DELETE /messages/:id                          → purga un sobre del propio buzón
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { decodePublicKey, fromBase64Url } from "../auth/ed25519";
import { requireSession } from "../plugins/authenticate";
import { isBlocked } from "../blocks/blocks";
import { deleteBlob, insertBlob, listBlobsFor } from "./blobs";

// Tope del sobre en base64url: 64 KiB ≈ 87381 chars; margen hasta 90000. El límite duro real
// lo impone el CHECK de la tabla (65536 bytes); aquí se rechaza pronto para no cargar de más.
const MAX_BLOB_B64 = 90_000;
const MESSAGES_PAGE = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sendBodySchema = {
  type: "object",
  required: ["blob"],
  additionalProperties: false,
  properties: {
    blob: { type: "string", minLength: 1, maxLength: MAX_BLOB_B64 },
  },
} as const;

interface SendBody {
  blob: string;
}

export interface MessagingRoutesOptions {
  rateLimit: { windowMs: number; messaging: number };
  blobTtlSeconds: number;
}

export const messagingRoutes: FastifyPluginAsync<MessagingRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const perRoute = {
    rateLimit: { max: opts.rateLimit.messaging, timeWindow: opts.rateLimit.windowMs },
  };

  // 1) Enviar un sobre al buzón de un destinatario. No se guarda el remitente (sealed sender).
  app.post<{ Params: { recipient: string }; Body: SendBody }>(
    "/messages/:recipient",
    { preHandler: requireSession, schema: { body: sendBodySchema }, config: perRoute },
    async (request, reply) => {
      const recipient = decodePublicKey(request.params.recipient);
      if (!recipient) return reply.code(400).send({ error: "invalid_recipient" });
      const payload = fromBase64Url(request.body.blob);
      if (!payload || payload.length === 0) return reply.code(400).send({ error: "invalid_blob" });
      if (payload.length > 65_536) return reply.code(413).send({ error: "blob_too_large" });

      // Bloqueo: si el destinatario ha bloqueado al remitente (autenticado por su sesión, aunque
      // el sobre almacenado sea sealed-sender), se DESCARTA en silencio y se responde como si se
      // hubiera entregado (201) — así el remitente no puede deducir que está bloqueado.
      if (await isBlocked(recipient, request.identity!.publicKey)) {
        return reply.code(201).send({ ok: true });
      }

      const result = await insertBlob(recipient, payload, opts.blobTtlSeconds);
      if (!result.ok) return reply.code(404).send({ error: result.reason });
      return reply.code(201).send({ ok: true });
    },
  );

  // 2) Recibir los sobres del propio buzón. `after` = cursor incremental (ISO). Retiene bajo TTL.
  app.get<{ Querystring: { after?: string } }>(
    "/messages",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      let after: Date | null = null;
      if (request.query.after) {
        after = new Date(request.query.after);
        if (Number.isNaN(after.getTime())) {
          return reply.code(400).send({ error: "invalid_cursor" });
        }
      }
      const messages = await listBlobsFor(request.identity!.publicKey, after, MESSAGES_PAGE);
      return reply.send({ messages });
    },
  );

  // 3) Purgar un sobre del propio buzón (ack/borrado por el destinatario).
  app.delete<{ Params: { id: string } }>(
    "/messages/:id",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      if (!UUID_RE.test(request.params.id)) {
        return reply.code(400).send({ error: "invalid_id" });
      }
      const removed = await deleteBlob(request.params.id, request.identity!.publicKey);
      if (!removed) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    },
  );
};
