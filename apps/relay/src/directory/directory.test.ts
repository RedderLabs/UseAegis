// Tests de integración del directorio de usuarios y las prekeys X25519.
//
// Mismo patrón que auth.test.ts: node:test + app.inject() contra la BBDD Docker real.
// Cada caso usa una IP distinta (X-Forwarded-For) para aislar su cubo de rate-limit.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { pool, closePool } from "../db/pool";
import { prekeyMessage } from "./prekey";

let app: FastifyInstance;
const createdPubkeys = new Set<string>();

const RL = { global: 1000, challenge: 50, verify: 50, directory: 100, windowMs: 60_000 };

interface Client {
  publicKeyB64: string;
  token: string;
  sign: (message: Buffer) => Buffer;
}

/** Crea una identidad Ed25519 y completa el handshake, devolviendo un cliente con token. */
async function newAuthedClient(ip: string): Promise<Client> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyB64 = (publicKey.export({ format: "jwk" }).x as string);
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
  return { publicKeyB64, token: vr.json().token, sign: signer };
}

function authHeaders(client: Client, ip: string) {
  return { "x-forwarded-for": ip, authorization: `Bearer ${client.token}` };
}

/** Genera un "material de prekey" (32 bytes) y su firma Ed25519 por el cliente. */
function makePrekey(client: Client): { x25519PublicKey: string; signature: string; raw: Buffer } {
  const raw = randomBytes(32);
  const signature = client.sign(prekeyMessage(raw));
  return {
    x25519PublicKey: raw.toString("base64url"),
    signature: signature.toString("base64url"),
    raw,
  };
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

test("reclamar handle → resolver por handle devuelve la identidad", async () => {
  const ip = "10.20.0.1";
  const client = await newAuthedClient(ip);
  const username = `alice_${randomBytes(3).toString("hex")}`;

  const claim = await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(client, ip),
    payload: { username },
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().username, username);

  const resolved = await app.inject({
    method: "GET",
    url: `/directory/resolve/${username}`,
    headers: authHeaders(client, ip),
  });
  assert.equal(resolved.statusCode, 200);
  const entry = resolved.json();
  assert.equal(entry.publicKey, client.publicKeyB64);
  assert.equal(entry.username, username);
  assert.equal(entry.keyBundle, null); // aún sin prekey publicada
});

test("resolución es case-insensitive", async () => {
  const ip = "10.20.0.2";
  const client = await newAuthedClient(ip);
  const username = `bob_${randomBytes(3).toString("hex")}`;
  await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(client, ip),
    payload: { username },
  });
  const resolved = await app.inject({
    method: "GET",
    url: `/directory/resolve/${username.toUpperCase()}`,
    headers: authHeaders(client, ip),
  });
  assert.equal(resolved.statusCode, 200);
  assert.equal(resolved.json().publicKey, client.publicKeyB64);
});

test("handle ya tomado por otra identidad → 409", async () => {
  const ipA = "10.20.0.3";
  const ipB = "10.20.0.4";
  const a = await newAuthedClient(ipA);
  const b = await newAuthedClient(ipB);
  const username = `carol_${randomBytes(3).toString("hex")}`;

  const first = await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(a, ipA),
    payload: { username },
  });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(b, ipB),
    payload: { username: username.toUpperCase() }, // mismo handle, distinta caja
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error, "username_taken");
});

test("handle con formato inválido → 400", async () => {
  const ip = "10.20.0.5";
  const client = await newAuthedClient(ip);
  const res = await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(client, ip),
    payload: { username: "ab" }, // < 3 chars
  });
  assert.equal(res.statusCode, 400);
});

test("publicar prekey firmada → aparece en el key bundle al resolver", async () => {
  const ip = "10.20.0.6";
  const client = await newAuthedClient(ip);
  const username = `dave_${randomBytes(3).toString("hex")}`;
  await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(client, ip),
    payload: { username },
  });

  const prekey = makePrekey(client);
  const pub = await app.inject({
    method: "PUT",
    url: "/directory/prekey",
    headers: authHeaders(client, ip),
    payload: { x25519PublicKey: prekey.x25519PublicKey, signature: prekey.signature },
  });
  assert.equal(pub.statusCode, 200);

  const resolved = await app.inject({
    method: "GET",
    url: `/directory/resolve/${username}`,
    headers: authHeaders(client, ip),
  });
  const bundle = resolved.json().keyBundle;
  assert.ok(bundle, "el bundle debería existir tras publicar la prekey");
  assert.equal(bundle.x25519PublicKey, prekey.x25519PublicKey);
  assert.equal(bundle.x25519Signature, prekey.signature);
});

test("prekey con firma que no corresponde a la identidad → 400", async () => {
  const ip = "10.20.0.7";
  const client = await newAuthedClient(ip);
  const raw = randomBytes(32);
  // Firma basura (64 bytes) que no valida contra la clave de la sesión.
  const res = await app.inject({
    method: "PUT",
    url: "/directory/prekey",
    headers: authHeaders(client, ip),
    payload: {
      x25519PublicKey: raw.toString("base64url"),
      signature: Buffer.alloc(64, 7).toString("base64url"),
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "prekey_signature_invalid");
});

test("bundle por clave pública tras publicar prekey", async () => {
  const ip = "10.20.0.8";
  const client = await newAuthedClient(ip);
  const prekey = makePrekey(client);
  await app.inject({
    method: "PUT",
    url: "/directory/prekey",
    headers: authHeaders(client, ip),
    payload: { x25519PublicKey: prekey.x25519PublicKey, signature: prekey.signature },
  });

  const res = await app.inject({
    method: "GET",
    url: `/directory/bundle/${client.publicKeyB64}`,
    headers: authHeaders(client, ip),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().keyBundle.x25519PublicKey, prekey.x25519PublicKey);
});

test("resolver handle inexistente → 404", async () => {
  const ip = "10.20.0.9";
  const client = await newAuthedClient(ip);
  const res = await app.inject({
    method: "GET",
    url: `/directory/resolve/nadie_${randomBytes(3).toString("hex")}`,
    headers: authHeaders(client, ip),
  });
  assert.equal(res.statusCode, 404);
});

test("directorio sin sesión → 401", async () => {
  const ip = "10.20.0.10";
  const res = await app.inject({
    method: "GET",
    url: "/directory/resolve/whoever",
    headers: { "x-forwarded-for": ip },
  });
  assert.equal(res.statusCode, 401);
});

test("/auth/me refleja handle y hasPrekey", async () => {
  const ip = "10.20.0.11";
  const client = await newAuthedClient(ip);
  const username = `erin_${randomBytes(3).toString("hex")}`;
  await app.inject({
    method: "PUT",
    url: "/directory/username",
    headers: authHeaders(client, ip),
    payload: { username },
  });
  const prekey = makePrekey(client);
  await app.inject({
    method: "PUT",
    url: "/directory/prekey",
    headers: authHeaders(client, ip),
    payload: { x25519PublicKey: prekey.x25519PublicKey, signature: prekey.signature },
  });

  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: authHeaders(client, ip),
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().username, username);
  assert.equal(me.json().hasPrekey, true);
});
