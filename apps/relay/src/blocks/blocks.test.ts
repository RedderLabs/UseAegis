// Tests de integración de los bloqueos: gestión de la lista y rechazo silencioso en el buzón.
//
// Mismo patrón que directory.test.ts: node:test + app.inject() contra la BBDD Docker real.
// Cada caso usa una IP distinta (X-Forwarded-For) para aislar su cubo de rate-limit.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { pool, closePool } from "../db/pool";

let app: FastifyInstance;
const createdPubkeys = new Set<string>();

const RL = { global: 1000, challenge: 50, verify: 50, directory: 100, messaging: 200, windowMs: 60_000 };

interface Client {
  publicKeyB64: string;
  token: string;
}

/** Crea una identidad Ed25519 y completa el handshake, devolviendo un cliente con token. */
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

function auth(client: Client, ip: string) {
  return { "x-forwarded-for": ip, authorization: `Bearer ${client.token}` };
}

/** Un sobre opaco cualquiera (el relay no lo descifra): base64url de bytes aleatorios. */
function someBlob(): string {
  return randomBytes(64).toString("base64url");
}

before(async () => {
  app = buildServer({ rateLimit: RL });
  await app.ready();
});

after(async () => {
  if (createdPubkeys.size > 0) {
    const keys = [...createdPubkeys].map((k) => Buffer.from(k, "base64url"));
    await pool.query(`DELETE FROM identities WHERE public_key = ANY($1::bytea[])`, [keys]);
    await pool.query(`DELETE FROM auth_challenges WHERE public_key = ANY($1::bytea[])`, [keys]);
  }
  await app.close();
  await closePool();
});

test("bloquear descarta en silencio: el sobre no llega, pero el envío responde 201", async () => {
  const ipA = "10.30.0.1";
  const ipB = "10.30.0.2";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);

  // Alice bloquea a Bob.
  const block = await app.inject({
    method: "PUT",
    url: `/blocks/${bob.publicKeyB64}`,
    headers: auth(alice, ipA),
  });
  assert.equal(block.statusCode, 200);

  // Bob intenta escribir a Alice: el relay responde 201 (no revela el bloqueo)…
  const send = await app.inject({
    method: "POST",
    url: `/messages/${alice.publicKeyB64}`,
    headers: auth(bob, ipB),
    payload: { blob: someBlob() },
  });
  assert.equal(send.statusCode, 201);

  // …pero el buzón de Alice sigue vacío: el sobre se descartó.
  const inbox = await app.inject({
    method: "GET",
    url: "/messages",
    headers: auth(alice, ipA),
  });
  assert.equal(inbox.statusCode, 200);
  assert.equal(inbox.json().messages.length, 0, "el sobre del bloqueado no debe almacenarse");
});

test("desbloquear restablece la entrega", async () => {
  const ipA = "10.30.0.3";
  const ipB = "10.30.0.4";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);

  await app.inject({ method: "PUT", url: `/blocks/${bob.publicKeyB64}`, headers: auth(alice, ipA) });
  await app.inject({
    method: "POST",
    url: `/messages/${alice.publicKeyB64}`,
    headers: auth(bob, ipB),
    payload: { blob: someBlob() },
  });

  // Desbloquear y reenviar → ahora sí llega.
  const unblock = await app.inject({
    method: "DELETE",
    url: `/blocks/${bob.publicKeyB64}`,
    headers: auth(alice, ipA),
  });
  assert.equal(unblock.statusCode, 200);

  await app.inject({
    method: "POST",
    url: `/messages/${alice.publicKeyB64}`,
    headers: auth(bob, ipB),
    payload: { blob: someBlob() },
  });
  const inbox = await app.inject({ method: "GET", url: "/messages", headers: auth(alice, ipA) });
  assert.equal(inbox.json().messages.length, 1, "tras desbloquear, el mensaje debe entregarse");
});

test("GET /blocks lista a los bloqueados", async () => {
  const ipA = "10.30.0.5";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient("10.30.0.6");
  const carol = await newAuthedClient("10.30.0.7");

  await app.inject({ method: "PUT", url: `/blocks/${bob.publicKeyB64}`, headers: auth(alice, ipA) });
  await app.inject({ method: "PUT", url: `/blocks/${carol.publicKeyB64}`, headers: auth(alice, ipA) });

  const list = await app.inject({ method: "GET", url: "/blocks", headers: auth(alice, ipA) });
  assert.equal(list.statusCode, 200);
  const blocked = (list.json().blocks as Array<{ publicKey: string }>).map((b) => b.publicKey);
  assert.equal(blocked.length, 2);
  assert.ok(blocked.includes(bob.publicKeyB64));
  assert.ok(blocked.includes(carol.publicKeyB64));
});

test("bloquear es idempotente (dos veces → sigue una entrada)", async () => {
  const ipA = "10.30.0.8";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient("10.30.0.9");

  await app.inject({ method: "PUT", url: `/blocks/${bob.publicKeyB64}`, headers: auth(alice, ipA) });
  const second = await app.inject({
    method: "PUT",
    url: `/blocks/${bob.publicKeyB64}`,
    headers: auth(alice, ipA),
  });
  assert.equal(second.statusCode, 200);

  const list = await app.inject({ method: "GET", url: "/blocks", headers: auth(alice, ipA) });
  assert.equal(list.json().blocks.length, 1);
});

test("no puedes bloquearte a ti mismo → 400", async () => {
  const ip = "10.30.0.10";
  const client = await newAuthedClient(ip);
  const res = await app.inject({
    method: "PUT",
    url: `/blocks/${client.publicKeyB64}`,
    headers: auth(client, ip),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "cannot_block_self");
});

test("gestionar bloqueos sin sesión → 401", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/blocks",
    headers: { "x-forwarded-for": "10.30.0.11" },
  });
  assert.equal(res.statusCode, 401);
});
