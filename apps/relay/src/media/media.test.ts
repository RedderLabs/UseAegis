// Tests de integración de las rutas de MEDIA (Modo A) — proxy al bucket S3-compatible.
//
// Mismo patrón que messaging.test.ts: node:test + app.inject() contra la BBDD Docker real y el
// bucket REAL (las claves S3_* del .env). Si el almacén no está configurado (config.media === null)
// los casos que tocan el bucket se saltan: la media es una capacidad opcional del despliegue.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { pool, closePool } from "../db/pool";
import { config } from "../config";
import { deleteObject } from "./s3";

let app: FastifyInstance;
const createdPubkeys = new Set<string>();
const createdKeys = new Set<string>(); // objetos subidos al bucket, para limpiarlos al terminar

const RL = { global: 1000, challenge: 50, verify: 50, directory: 100, messaging: 500, windowMs: 60_000 };
const mediaOn = config.media !== null;

interface Client {
  publicKeyB64: string;
  token: string;
}

async function newAuthedClient(ip: string): Promise<Client> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyB64 = publicKey.export({ format: "jwk" }).x as string;
  createdPubkeys.add(publicKeyB64);
  const signer = (message: Buffer) => sign(null, message, privateKey);

  const ch = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    headers: { "x-forwarded-for": ip },
    payload: { publicKey: publicKeyB64 },
  });
  const challenge = ch.json();
  const signature = signer(Buffer.from(challenge.message, "base64url"));
  const vr = await app.inject({
    method: "POST",
    url: "/auth/verify",
    headers: { "x-forwarded-for": ip },
    payload: { challengeId: challenge.challengeId, signature: signature.toString("base64url") },
  });
  assert.equal(vr.statusCode, 200, "handshake debería emitir sesión");
  return { publicKeyB64, token: vr.json().token };
}

function upHeaders(client: Client, ip: string) {
  return {
    "x-forwarded-for": ip,
    authorization: `Bearer ${client.token}`,
    "content-type": "application/octet-stream",
  };
}

before(async () => {
  app = buildServer({ rateLimit: RL });
  await app.ready();
});

after(async () => {
  if (mediaOn && createdKeys.size > 0) {
    for (const key of createdKeys) {
      await deleteObject(config.media!, key).catch(() => undefined);
    }
    const keys = [...createdKeys];
    await pool.query(`DELETE FROM media_objects WHERE object_key = ANY($1::uuid[])`, [keys]);
  }
  if (createdPubkeys.size > 0) {
    const keys = [...createdPubkeys].map((k) => Buffer.from(k, "base64url"));
    await pool.query(`DELETE FROM identities WHERE public_key = ANY($1::bytea[])`, [keys]);
    await pool.query(`DELETE FROM auth_challenges WHERE public_key = ANY($1::bytea[])`, [keys]);
  }
  await app.close();
  await closePool();
});

test("subir un objeto y descargarlo → round-trip íntegro", async (t) => {
  if (!mediaOn) return t.skip("S3 no configurado (config.media === null)");
  const ip = "10.40.0.1";
  const alice = await newAuthedClient(ip);
  const payload = randomBytes(4096); // ciphertext opaco simulado

  const up = await app.inject({
    method: "POST",
    url: "/media",
    headers: upHeaders(alice, ip),
    payload,
  });
  assert.equal(up.statusCode, 201, up.payload);
  const key = up.json().key as string;
  assert.match(key, /^[0-9a-f-]{36}$/);
  createdKeys.add(key);

  const down = await app.inject({
    method: "GET",
    url: `/media/${key}`,
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${alice.token}` },
  });
  assert.equal(down.statusCode, 200);
  assert.ok(down.rawPayload.equals(payload), "el objeto descargado debe ser idéntico al subido");
});

test("descargar un objeto de otra sesión también funciona (la key es la capability)", async (t) => {
  if (!mediaOn) return t.skip("S3 no configurado");
  const ipA = "10.40.0.2";
  const ipB = "10.40.0.3";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);
  const payload = randomBytes(1024);

  const up = await app.inject({ method: "POST", url: "/media", headers: upHeaders(alice, ipA), payload });
  const key = up.json().key as string;
  createdKeys.add(key);

  // Bob (destinatario real en el flujo E2E) descarga con SU sesión + la key que le llegó en el sobre.
  const down = await app.inject({
    method: "GET",
    url: `/media/${key}`,
    headers: { "x-forwarded-for": ipB, authorization: `Bearer ${bob.token}` },
  });
  assert.equal(down.statusCode, 200);
  assert.ok(down.rawPayload.equals(payload));
});

test("subir sin sesión → 401", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/media",
    headers: { "x-forwarded-for": "10.40.0.4", "content-type": "application/octet-stream" },
    payload: randomBytes(16),
  });
  assert.equal(res.statusCode, 401);
});

test("descargar con key mal formada → 400", async (t) => {
  if (!mediaOn) return t.skip("S3 no configurado");
  const ip = "10.40.0.5";
  const alice = await newAuthedClient(ip);
  const res = await app.inject({
    method: "GET",
    url: "/media/no-es-un-uuid",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${alice.token}` },
  });
  assert.equal(res.statusCode, 400);
});

test("descargar una key inexistente (uuid válido) → 404", async (t) => {
  if (!mediaOn) return t.skip("S3 no configurado");
  const ip = "10.40.0.6";
  const alice = await newAuthedClient(ip);
  const res = await app.inject({
    method: "GET",
    url: "/media/00000000-0000-4000-8000-000000000000",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${alice.token}` },
  });
  assert.equal(res.statusCode, 404);
});
