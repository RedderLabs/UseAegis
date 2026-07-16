// Rutas de gestión de bloqueos.
//
// Todas requieren sesión (bearer): un usuario gestiona SU propia lista de bloqueos. El efecto de
// un bloqueo (descartar sobres del bloqueado) lo aplica el buzón en el envío (ver messaging/routes).
//
//   PUT    /blocks/:pubkey   → bloquea a esa clave pública
//   DELETE /blocks/:pubkey   → desbloquea
//   GET    /blocks           → lista de bloqueados de la propia identidad
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { decodePublicKey } from "../auth/ed25519";
import { requireSession } from "../plugins/authenticate";
import { addBlock, listBlocks, removeBlock } from "./blocks";

export interface BlocksRoutesOptions {
  rateLimit: { windowMs: number; directory: number };
}

export const blocksRoutes: FastifyPluginAsync<BlocksRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  // Gestión de bloqueos: baja frecuencia, comparte el cubo del directorio.
  const perRoute = {
    rateLimit: { max: opts.rateLimit.directory, timeWindow: opts.rateLimit.windowMs },
  };

  // 1) Bloquear a una clave pública.
  app.put<{ Params: { pubkey: string } }>(
    "/blocks/:pubkey",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      const blocked = decodePublicKey(request.params.pubkey);
      if (!blocked) return reply.code(400).send({ error: "invalid_public_key" });
      if (blocked.equals(request.identity!.publicKey)) {
        return reply.code(400).send({ error: "cannot_block_self" });
      }
      await addBlock(request.identity!.publicKey, blocked);
      return reply.code(200).send({ ok: true });
    },
  );

  // 2) Desbloquear. Idempotente: desbloquear a quien no estaba bloqueado también responde ok.
  app.delete<{ Params: { pubkey: string } }>(
    "/blocks/:pubkey",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      const blocked = decodePublicKey(request.params.pubkey);
      if (!blocked) return reply.code(400).send({ error: "invalid_public_key" });
      await removeBlock(request.identity!.publicKey, blocked);
      return reply.code(200).send({ ok: true });
    },
  );

  // 3) Lista de bloqueados de la propia identidad.
  app.get(
    "/blocks",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      const blocks = await listBlocks(request.identity!.publicKey);
      return reply.send({ blocks });
    },
  );
};
