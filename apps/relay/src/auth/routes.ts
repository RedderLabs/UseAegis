// Rutas de la API de Auth / AuthSession.
//
// Handshake challenge-response (docs/ARQUITECTURA.md §2):
//   1. POST /auth/challenge  { publicKey }            → { challengeId, nonce, message, expiresAt }
//   2. el cliente firma `message` (= "aegis-auth:v1:" || nonce) con su clave privada Ed25519
//   3. POST /auth/verify     { challengeId, signature } → { token, expiresAt, identity }
//   4. peticiones autenticadas: header  Authorization: Bearer <token>
//   5. POST /auth/logout     (bearer)                 → revoca la sesión
//   6. GET  /auth/me         (bearer)                 → identidad actual
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  decodePublicKey,
  decodeSignature,
  toBase64Url,
  verifySignature,
} from "./ed25519";
import {
  challengeMessage,
  consumeChallenge,
  createChallenge,
} from "./challenges";
import { upsertIdentity } from "./identities";
import { getEntry } from "../directory/directory";
import { issueSession, revokeSession } from "./sessions";
import { withTransaction } from "../db/pool";
import { requireSession } from "../plugins/authenticate";
import { config } from "../config";

const challengeBodySchema = {
  type: "object",
  required: ["publicKey"],
  additionalProperties: false,
  properties: {
    publicKey: { type: "string", minLength: 43, maxLength: 43 }, // 32 bytes en base64url
  },
} as const;

const verifyBodySchema = {
  type: "object",
  required: ["challengeId", "signature"],
  additionalProperties: false,
  properties: {
    challengeId: { type: "string", format: "uuid" },
    signature: { type: "string", minLength: 86, maxLength: 88 }, // 64 bytes en base64url
  },
} as const;

interface ChallengeBody {
  publicKey: string;
}
interface VerifyBody {
  challengeId: string;
  signature: string;
}

export interface AuthRoutesOptions {
  rateLimit: { windowMs: number; challenge: number; verify: number };
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app: FastifyInstance,
  opts,
) => {
  const { rateLimit } = opts;

  // 1) Pedir un challenge para una clave pública.
  app.post<{ Body: ChallengeBody }>(
    "/auth/challenge",
    {
      schema: { body: challengeBodySchema },
      config: { rateLimit: { max: rateLimit.challenge, timeWindow: rateLimit.windowMs } },
    },
    async (request, reply) => {
      const publicKey = decodePublicKey(request.body.publicKey);
      if (!publicKey) {
        return reply.code(400).send({ error: "invalid_public_key" });
      }

      const challenge = await createChallenge(publicKey, config.challengeTtlSeconds);
      return reply.code(201).send({
        challengeId: challenge.id,
        nonce: toBase64Url(challenge.nonce),
        // Mensaje exacto que el cliente debe firmar (dominio || nonce), ya en base64url.
        message: toBase64Url(challengeMessage(challenge.nonce)),
        expiresAt: challenge.expires_at.toISOString(),
      });
    },
  );

  // 2) Canjear el challenge firmado por un token de sesión.
  app.post<{ Body: VerifyBody }>(
    "/auth/verify",
    {
      schema: { body: verifyBodySchema },
      config: { rateLimit: { max: rateLimit.verify, timeWindow: rateLimit.windowMs } },
    },
    async (request, reply) => {
      const signature = decodeSignature(request.body.signature);
      if (!signature) {
        return reply.code(400).send({ error: "invalid_signature_encoding" });
      }

      const userAgent = request.headers["user-agent"] ?? null;

      // Consumir el challenge, verificar la firma y emitir la sesión en una sola
      // transacción: si la firma no valida, el ROLLBACK deja el challenge consumido
      // igualmente (un solo intento por challenge — no hay oráculo de reintento).
      const result = await withTransaction(async (client) => {
        const challenge = await consumeChallenge(request.body.challengeId, client);
        if (!challenge) return { ok: false as const, reason: "challenge_not_found_or_expired" };

        const message = challengeMessage(challenge.nonce);
        if (!verifySignature(challenge.public_key, message, signature)) {
          return { ok: false as const, reason: "signature_verification_failed" };
        }

        await upsertIdentity(challenge.public_key, client);
        const session = await issueSession(
          challenge.public_key,
          config.sessionTtlSeconds,
          userAgent,
          client,
        );
        return { ok: true as const, publicKey: challenge.public_key, session };
      });

      if (!result.ok) {
        const code = result.reason === "signature_verification_failed" ? 401 : 400;
        return reply.code(code).send({ error: result.reason });
      }

      return reply.code(200).send({
        token: result.session.token,
        expiresAt: result.session.expiresAt.toISOString(),
        identity: {
          publicKey: toBase64Url(result.publicKey),
          fingerprint: toBase64Url(result.publicKey),
        },
      });
    },
  );

  // 3) Identidad de la sesión actual, incluido su handle y si ya publicó prekey.
  app.get("/auth/me", { preHandler: requireSession }, async (request, reply) => {
    const identity = request.identity!;
    const entry = await getEntry(identity.publicKey);
    return reply.send({
      publicKey: toBase64Url(identity.publicKey),
      fingerprint: identity.fingerprint,
      sessionId: identity.sessionId,
      username: entry?.username ?? null,
      hasPrekey: Boolean(entry?.keyBundle),
    });
  });

  // 4) Cerrar sesión (revoca el token presentado).
  app.post("/auth/logout", { preHandler: requireSession }, async (request, reply) => {
    const header = request.headers.authorization ?? "";
    const raw = /^Bearer (.+)$/.exec(header.trim())?.[1]?.trim();
    const tokenBytes = raw ? Buffer.from(raw, "base64url") : null;
    if (tokenBytes) await revokeSession(tokenBytes);
    return reply.code(204).send();
  });
};
