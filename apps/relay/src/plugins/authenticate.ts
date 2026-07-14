// preHandler de Fastify que exige un bearer token de sesión válido y adjunta la
// identidad autenticada a la request. Úsalo en cualquier ruta que requiera sesión.
import type { FastifyReply, FastifyRequest } from "fastify";
import { fromBase64Url, toBase64Url } from "../auth/ed25519";
import { resolveSession } from "../auth/sessions";

export interface AuthedIdentity {
  publicKey: Buffer;
  fingerprint: string;
  sessionId: string;
}

// Extiende el tipo de FastifyRequest con la identidad resuelta.
declare module "fastify" {
  interface FastifyRequest {
    identity?: AuthedIdentity;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const raw = extractBearer(request.headers.authorization);
  const tokenBytes = raw ? fromBase64Url(raw) : null;
  if (!tokenBytes) {
    await reply.code(401).send({ error: "missing_or_malformed_token" });
    return;
  }

  const session = await resolveSession(tokenBytes);
  if (!session) {
    await reply.code(401).send({ error: "invalid_or_expired_session" });
    return;
  }

  request.identity = {
    publicKey: session.public_key,
    fingerprint: toBase64Url(session.public_key),
    sessionId: session.id,
  };
}
