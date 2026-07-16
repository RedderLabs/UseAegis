// Rutas del directorio de usuarios y de las prekeys X25519.
//
// Todas requieren sesión (bearer): solo un usuario autenticado publica su handle/prekey o
// consulta a otros. Así el directorio no es un padrón anónimo raspable por cualquiera.
//
//   PUT /directory/username        { username }                     → reclama/cambia handle
//   PUT /directory/prekey          { x25519PublicKey, signature }   → publica prekey firmada
//   GET /directory/resolve/:username                                → handle → { identidad, keyBundle }
//   GET /directory/bundle/:publicKey                                → pubkey → { identidad, keyBundle }
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { decodePublicKey, decodeSignature } from "../auth/ed25519";
import { requireSession } from "../plugins/authenticate";
import { verifyPrekeySignature } from "./prekey";
import {
  getEntry,
  isReservedUsername,
  normalizeUsername,
  publishPrekey,
  resolveByUsername,
  setUsername,
  USERNAME_RE,
} from "./directory";

const usernameBodySchema = {
  type: "object",
  required: ["username"],
  additionalProperties: false,
  properties: {
    username: { type: "string", minLength: 3, maxLength: 20 },
  },
} as const;

const prekeyBodySchema = {
  type: "object",
  required: ["x25519PublicKey", "signature"],
  additionalProperties: false,
  properties: {
    x25519PublicKey: { type: "string", minLength: 43, maxLength: 43 }, // 32 bytes base64url
    signature: { type: "string", minLength: 86, maxLength: 88 }, // 64 bytes base64url
  },
} as const;

interface UsernameBody {
  username: string;
}
interface PrekeyBody {
  x25519PublicKey: string;
  signature: string;
}

export interface DirectoryRoutesOptions {
  rateLimit: { windowMs: number; directory: number };
}

export const directoryRoutes: FastifyPluginAsync<DirectoryRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const perRoute = {
    rateLimit: { max: opts.rateLimit.directory, timeWindow: opts.rateLimit.windowMs },
  };

  // 1) Reclamar / cambiar el handle público con el que otros te encuentran.
  app.put<{ Body: UsernameBody }>(
    "/directory/username",
    { preHandler: requireSession, schema: { body: usernameBodySchema }, config: perRoute },
    async (request, reply) => {
      const username = normalizeUsername(request.body.username);
      if (!USERNAME_RE.test(username)) {
        return reply.code(400).send({ error: "invalid_username" });
      }
      if (isReservedUsername(username)) {
        return reply.code(400).send({ error: "username_reserved" });
      }
      const result = await setUsername(request.identity!.publicKey, username);
      if (!result.ok) {
        return reply.code(409).send({ error: result.reason });
      }
      return reply.code(200).send({ username: result.username });
    },
  );

  // 2) Publicar / rotar la prekey X25519 firmada (material de acuerdo de clave).
  app.put<{ Body: PrekeyBody }>(
    "/directory/prekey",
    { preHandler: requireSession, schema: { body: prekeyBodySchema }, config: perRoute },
    async (request, reply) => {
      const x25519 = decodePublicKey(request.body.x25519PublicKey);
      if (!x25519) return reply.code(400).send({ error: "invalid_prekey" });
      const signature = decodeSignature(request.body.signature);
      if (!signature) return reply.code(400).send({ error: "invalid_signature_encoding" });

      // La firma debe validar contra la clave Ed25519 de LA PROPIA sesión: un usuario solo
      // publica prekeys atadas a su identidad, nunca a nombre de otro.
      if (!verifyPrekeySignature(request.identity!.publicKey, x25519, signature)) {
        return reply.code(400).send({ error: "prekey_signature_invalid" });
      }

      await publishPrekey(request.identity!.publicKey, x25519, signature);
      return reply.code(200).send({ ok: true });
    },
  );

  // 3) Buscar a alguien por su handle → identidad + key bundle para conectar.
  app.get<{ Params: { username: string } }>(
    "/directory/resolve/:username",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      const username = normalizeUsername(request.params.username);
      if (!USERNAME_RE.test(username)) {
        return reply.code(400).send({ error: "invalid_username" });
      }
      const entry = await resolveByUsername(username);
      if (!entry) return reply.code(404).send({ error: "not_found" });
      return reply.send(entry);
    },
  );

  // 4) Key bundle por clave pública (p. ej. tras escanear el QR de contacto de §2).
  app.get<{ Params: { publicKey: string } }>(
    "/directory/bundle/:publicKey",
    { preHandler: requireSession, config: perRoute },
    async (request, reply) => {
      const publicKey = decodePublicKey(request.params.publicKey);
      if (!publicKey) return reply.code(400).send({ error: "invalid_public_key" });
      const entry = await getEntry(publicKey);
      if (!entry) return reply.code(404).send({ error: "not_found" });
      return reply.send(entry);
    },
  );
};
