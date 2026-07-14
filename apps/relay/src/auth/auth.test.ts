// Tests de integración de la API de Auth / AuthSession.
//
// Usan node:test + app.inject() (sin abrir puerto) contra la BBDD Docker real, que el
// script `pnpm test` levanta y migra antes. Cada caso usa una IP distinta vía
// X-Forwarded-For (trustProxy) para aislar sus cubos de rate-limit.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { pool, closePool } from "../db/pool";
import { deleteExpiredChallenges } from "./challenges";
import { deleteDeadSessions } from "./sessions";

let app: FastifyInstance;
const createdPubkeys = new Set<string>(); // base64url, para limpiar al final

// Límites de rate-limit bajos para poder disparar el 429 sin miles de peticiones.
const RL = { global: 1000, challenge: 5, verify: 5, windowMs: 60_000 };

interface Client {
  publicKeyB64: string;
  sign: (message: Buffer) => Buffer;
}

function newClient(): Client {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  const publicKeyB64 = jwk.x as string; // 32 bytes en base64url
  createdPubkeys.add(publicKeyB64);
  return { publicKeyB64, sign: (message) => sign(null, message, privateKey) };
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

before(async () => {
  app = buildServer({ rateLimit: RL });
  await app.ready();
});

after(async () => {
  // Limpia las identidades creadas (CASCADE borra sus sesiones) y sus challenges.
  if (createdPubkeys.size > 0) {
    const keys = [...createdPubkeys].map((k) => Buffer.from(k, "base64url"));
    await pool.query(`DELETE FROM identities WHERE public_key = ANY($1::bytea[])`, [keys]);
    await pool.query(`DELETE FROM auth_challenges WHERE public_key = ANY($1::bytea[])`, [keys]);
  }
  await app.close();
  await closePool();
});

test("GET /health reporta la BBDD arriba", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok", db: "up" });
});

test("handshake completo: challenge → verify → me → logout", async () => {
  const ip = "10.10.0.1";
  const client = newClient();

  const ch = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    headers: { "x-forwarded-for": ip },
    payload: { publicKey: client.publicKeyB64 },
  });
  assert.equal(ch.statusCode, 201);
  const challenge = ch.json();
  assert.equal(typeof challenge.challengeId, "string");

  const message = Buffer.from(challenge.message, "base64url");
  const signature = client.sign(message);

  const vr = await app.inject({
    method: "POST",
    url: "/auth/verify",
    headers: { "x-forwarded-for": ip },
    payload: { challengeId: challenge.challengeId, signature: b64url(signature) },
  });
  assert.equal(vr.statusCode, 200);
  const verified = vr.json();
  assert.equal(typeof verified.token, "string");
  assert.equal(verified.identity.publicKey, client.publicKeyB64);

  const token = verified.token;
  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${token}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().publicKey, client.publicKeyB64);

  const logout = await app.inject({
    method: "POST",
    url: "/auth/logout",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${token}` },
  });
  assert.equal(logout.statusCode, 204);

  // Sesión revocada: el mismo token ya no vale.
  const meAfter = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${token}` },
  });
  assert.equal(meAfter.statusCode, 401);
});

test("challenge con publicKey demasiado corta → 400 (validación de esquema)", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    headers: { "x-forwarded-for": "10.10.0.2" },
    payload: { publicKey: "abc" },
  });
  assert.equal(res.statusCode, 400);
});

test("challenge con base64url inválido (longitud ok) → 400 invalid_public_key", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    headers: { "x-forwarded-for": "10.10.0.3" },
    payload: { publicKey: "!".repeat(43) },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_public_key");
});

test("verify con firma inválida → 401", async () => {
  const ip = "10.10.0.4";
  const client = newClient();
  const ch = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    headers: { "x-forwarded-for": ip },
    payload: { publicKey: client.publicKeyB64 },
  });
  const badSignature = Buffer.alloc(64, 7);
  const res = await app.inject({
    method: "POST",
    url: "/auth/verify",
    headers: { "x-forwarded-for": ip },
    payload: { challengeId: ch.json().challengeId, signature: b64url(badSignature) },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "signature_verification_failed");
});

test("verify no se puede reutilizar (challenge single-use)", async () => {
  const ip = "10.10.0.5";
  const client = newClient();
  const ch = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    headers: { "x-forwarded-for": ip },
    payload: { publicKey: client.publicKeyB64 },
  });
  const challenge = ch.json();
  const signature = client.sign(Buffer.from(challenge.message, "base64url"));
  const payload = { challengeId: challenge.challengeId, signature: b64url(signature) };

  const first = await app.inject({ method: "POST", url: "/auth/verify", headers: { "x-forwarded-for": ip }, payload });
  assert.equal(first.statusCode, 200);
  const second = await app.inject({ method: "POST", url: "/auth/verify", headers: { "x-forwarded-for": ip }, payload });
  assert.equal(second.statusCode, 400);
  assert.equal(second.json().error, "challenge_not_found_or_expired");
});

test("verify con challengeId desconocido → 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/verify",
    headers: { "x-forwarded-for": "10.10.0.6" },
    payload: { challengeId: randomUUID(), signature: b64url(Buffer.alloc(64, 1)) },
  });
  assert.equal(res.statusCode, 400);
});

test("/auth/me sin token → 401", async () => {
  const res = await app.inject({ method: "GET", url: "/auth/me", headers: { "x-forwarded-for": "10.10.0.7" } });
  assert.equal(res.statusCode, 401);
});

test("rate-limit: superar el máximo de /auth/challenge → 429", async () => {
  const ip = "10.10.9.9"; // IP dedicada para no gastar el cubo de otros tests
  const client = newClient();
  let saw429 = false;
  for (let i = 0; i < RL.challenge + 2; i++) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/challenge",
      headers: { "x-forwarded-for": ip },
      payload: { publicKey: client.publicKeyB64 },
    });
    if (res.statusCode === 429) saw429 = true;
  }
  assert.ok(saw429, "se esperaba al menos un 429 tras superar el límite");
});

test("mantenimiento: barre challenges y sesiones vencidas", async () => {
  const client = newClient();
  const pubkey = Buffer.from(client.publicKeyB64, "base64url");

  // Challenge ya expirado, insertado directamente.
  await pool.query(
    `INSERT INTO auth_challenges (public_key, nonce, expires_at)
     VALUES ($1, $2, now() - interval '1 minute')`,
    [pubkey, Buffer.alloc(32, 3)],
  );
  const removedChallenges = await deleteExpiredChallenges();
  assert.ok(removedChallenges >= 1);

  // Identidad + sesión ya expirada.
  await pool.query(
    `INSERT INTO identities (public_key, fingerprint) VALUES ($1, $2)
       ON CONFLICT (public_key) DO NOTHING`,
    [pubkey, client.publicKeyB64],
  );
  await pool.query(
    `INSERT INTO auth_sessions (public_key, token_hash, expires_at)
     VALUES ($1, $2, now() - interval '1 minute')`,
    [pubkey, Buffer.alloc(32, 9)],
  );
  const removedSessions = await deleteDeadSessions();
  assert.ok(removedSessions >= 1);
});
