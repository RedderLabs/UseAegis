// Tests de integración del buzón de mensajes (Modo A).
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

const RL = { global: 1000, challenge: 50, verify: 50, directory: 100, messaging: 500, windowMs: 60_000 };

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

function authHeaders(client: Client, ip: string) {
  return { "x-forwarded-for": ip, authorization: `Bearer ${client.token}` };
}

const blob = () => randomBytes(120).toString("base64url");

before(async () => {
  app = buildServer({ rateLimit: RL });
  await app.ready();
});

after(async () => {
  if (createdPubkeys.size > 0) {
    const keys = [...createdPubkeys].map((k) => Buffer.from(k, "base64url"));
    // messages tiene FK ON DELETE CASCADE sobre identities, así que borrar identidades limpia el buzón.
    await pool.query(`DELETE FROM identities WHERE public_key = ANY($1::bytea[])`, [keys]);
    await pool.query(`DELETE FROM auth_challenges WHERE public_key = ANY($1::bytea[])`, [keys]);
  }
  await app.close();
  await closePool();
});

test("enviar un sobre → el destinatario lo recibe en su buzón", async () => {
  const ipA = "10.30.0.1";
  const ipB = "10.30.0.2";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);
  const payload = blob();

  const sent = await app.inject({
    method: "POST",
    url: `/messages/${bob.publicKeyB64}`,
    headers: authHeaders(alice, ipA),
    payload: { blob: payload },
  });
  assert.equal(sent.statusCode, 201);

  const inbox = await app.inject({
    method: "GET",
    url: "/messages",
    headers: authHeaders(bob, ipB),
  });
  assert.equal(inbox.statusCode, 200);
  const messages = inbox.json().messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].blob, payload);
  assert.ok(messages[0].id && messages[0].createdAt);
});

test("sealed sender: el remitente no ve el sobre en SU propio buzón", async () => {
  const ipA = "10.30.0.3";
  const ipB = "10.30.0.4";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);

  await app.inject({
    method: "POST",
    url: `/messages/${bob.publicKeyB64}`,
    headers: authHeaders(alice, ipA),
    payload: { blob: blob() },
  });

  // El buzón se indexa por DESTINATARIO: el de alice sigue vacío.
  const aliceInbox = await app.inject({
    method: "GET",
    url: "/messages",
    headers: authHeaders(alice, ipA),
  });
  assert.equal(aliceInbox.json().messages.length, 0);
});

test("cursor `after` devuelve solo lo posterior", async () => {
  const ipA = "10.30.0.5";
  const ipB = "10.30.0.6";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);

  await app.inject({
    method: "POST",
    url: `/messages/${bob.publicKeyB64}`,
    headers: authHeaders(alice, ipA),
    payload: { blob: blob() },
  });
  // Pequeña espera para separar los created_at.
  await new Promise((r) => setTimeout(r, 10));
  const second = blob();
  await app.inject({
    method: "POST",
    url: `/messages/${bob.publicKeyB64}`,
    headers: authHeaders(alice, ipA),
    payload: { blob: second },
  });

  const all = (
    await app.inject({ method: "GET", url: "/messages", headers: authHeaders(bob, ipB) })
  ).json().messages;
  assert.equal(all.length, 2);

  const after = encodeURIComponent(all[0].createdAt);
  const rest = (
    await app.inject({
      method: "GET",
      url: `/messages?after=${after}`,
      headers: authHeaders(bob, ipB),
    })
  ).json().messages;
  assert.equal(rest.length, 1);
  assert.equal(rest[0].blob, second);
});

test("destinatario desconocido (sin identidad) → 404", async () => {
  const ip = "10.30.0.7";
  const alice = await newAuthedClient(ip);
  const ghost = randomBytes(32).toString("base64url"); // nunca autenticó → no existe

  const res = await app.inject({
    method: "POST",
    url: `/messages/${ghost}`,
    headers: authHeaders(alice, ip),
    payload: { blob: blob() },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "recipient_not_found");
});

test("destinatario mal formado → 400", async () => {
  const ip = "10.30.0.8";
  const alice = await newAuthedClient(ip);
  const res = await app.inject({
    method: "POST",
    url: `/messages/no-es-una-clave`,
    headers: authHeaders(alice, ip),
    payload: { blob: blob() },
  });
  assert.equal(res.statusCode, 400);
});

test("purgar un sobre propio → desaparece del buzón", async () => {
  const ipA = "10.30.0.9";
  const ipB = "10.30.0.10";
  const alice = await newAuthedClient(ipA);
  const bob = await newAuthedClient(ipB);
  await app.inject({
    method: "POST",
    url: `/messages/${bob.publicKeyB64}`,
    headers: authHeaders(alice, ipA),
    payload: { blob: blob() },
  });

  const id = (
    await app.inject({ method: "GET", url: "/messages", headers: authHeaders(bob, ipB) })
  ).json().messages[0].id;

  const del = await app.inject({
    method: "DELETE",
    url: `/messages/${id}`,
    headers: authHeaders(bob, ipB),
  });
  assert.equal(del.statusCode, 204);

  const inbox = (
    await app.inject({ method: "GET", url: "/messages", headers: authHeaders(bob, ipB) })
  ).json().messages;
  assert.equal(inbox.length, 0);
});

test("buzón sin sesión → 401", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/messages",
    headers: { "x-forwarded-for": "10.30.0.11" },
  });
  assert.equal(res.statusCode, 401);
});
