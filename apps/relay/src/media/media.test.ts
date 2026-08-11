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
import { dailyLimitFor, deleteExpiredUsage, quotaForAgeDays } from "./quota";

let app: FastifyInstance;
const createdPubkeys = new Set<string>();
const createdKeys = new Set<string>(); // objetos subidos al bucket, para limpiarlos al terminar

const RL = { global: 1000, challenge: 50, verify: 50, directory: 100, messaging: 500, windowMs: 60_000 };
const mediaOn = config.media !== null;
const quotaOn = config.quota !== null;

/** Bytes de la identidad, en un día concreto (offset negativo = días atrás). Simula uso previo. */
async function seedUsage(publicKeyB64: string, bytes: number, dayOffset = 0): Promise<void> {
  await pool.query(
    `INSERT INTO storage_usage (identity, day, bytes)
          VALUES ($1, CURRENT_DATE + $3::int, $2)
     ON CONFLICT (identity, day) DO UPDATE SET bytes = EXCLUDED.bytes`,
    [Buffer.from(publicKeyB64, "base64url"), bytes, dayOffset],
  );
}

/** Envejece una identidad para probar la rampa de maduración sin esperar 30 días. */
async function ageIdentity(publicKeyB64: string, days: number): Promise<void> {
  await pool.query(
    `UPDATE identities SET created_at = now() - ($2::int * interval '1 day') WHERE public_key = $1`,
    [Buffer.from(publicKeyB64, "base64url"), days],
  );
}

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

// ─────────────────────────── Cuota de almacenamiento ───────────────────────────

test("la cuota madura con la edad: día 0 = base, día ≥ rampa = máximo", () => {
  const cfg = { baseBytes: 100, maxBytes: 1100, rampDays: 10, dailyMinBytes: 50 };
  assert.equal(quotaForAgeDays(cfg, 0), 100, "una identidad recién creada vale el tramo base");
  assert.equal(quotaForAgeDays(cfg, 5), 600, "a mitad de rampa, la mitad del recorrido");
  assert.equal(quotaForAgeDays(cfg, 10), 1100, "al cumplir la rampa, cuota máxima");
  assert.equal(quotaForAgeDays(cfg, 999), 1100, "no crece más allá del máximo");
  assert.equal(quotaForAgeDays(cfg, -3), 100, "una edad imposible cae al tramo más restrictivo");
  // La ráfaga diaria nunca baja del suelo configurado.
  assert.equal(dailyLimitFor(cfg, 1100), 550);
  assert.equal(dailyLimitFor(cfg, 60), 50);
});

test("GET /media/quota devuelve el estado de la identidad", async (t) => {
  if (!mediaOn || !quotaOn) return t.skip("S3 o cuota no configurados");
  const ip = "10.40.0.7";
  const alice = await newAuthedClient(ip);
  await ageIdentity(alice.publicKeyB64, 90); // identidad madura → cuota máxima

  const res = await app.inject({
    method: "GET",
    url: "/media/quota",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${alice.token}` },
  });
  assert.equal(res.statusCode, 200, res.payload);
  const body = res.json();
  assert.equal(body.enabled, true);
  assert.equal(body.quota, config.quota!.maxBytes, "una identidad de 90 días tiene la cuota máxima");
  assert.equal(body.used, 0);
  assert.equal(body.freesAt, null, "sin nada almacenado no hay fecha de liberación");
  assert.equal(res.headers["x-aegis-quota-bytes"], String(config.quota!.maxBytes));
});

test("superar el techo en reposo → 507 y NO se sube nada al bucket", async (t) => {
  if (!mediaOn || !quotaOn) return t.skip("S3 o cuota no configurados");
  const ip = "10.40.0.8";
  const alice = await newAuthedClient(ip);
  // Identidad recién creada (día 0) → cuota = baseBytes. Se le llena de un día anterior, así que
  // el cubo de hoy queda a cero y lo que salta es el techo en reposo, no la ráfaga diaria.
  await seedUsage(alice.publicKeyB64, config.quota!.baseBytes, -1);

  const res = await app.inject({
    method: "POST",
    url: "/media",
    headers: upHeaders(alice, ip),
    payload: randomBytes(4096),
  });
  assert.equal(res.statusCode, 507, res.payload);
  const body = res.json();
  assert.equal(body.error, "quota_exceeded");
  assert.equal(body.quota, config.quota!.baseBytes);
  assert.ok(body.freesAt, "la respuesta debe decirle al usuario CUÁNDO recupera espacio");
  assert.equal(body.freesBytes, config.quota!.baseBytes);

  // El débito rechazado no deja rastro: el uso sigue siendo exactamente el sembrado.
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(bytes), 0) AS total FROM storage_usage WHERE identity = $1`,
    [Buffer.from(alice.publicKeyB64, "base64url")],
  );
  assert.equal(Number(rows[0]!.total), config.quota!.baseBytes, "el ROLLBACK debe dejarlo intacto");
});

test("superar la ráfaga diaria (con hueco de cuota) → 429 con retry-after", async (t) => {
  if (!mediaOn || !quotaOn) return t.skip("S3 o cuota no configurados");
  const ip = "10.40.0.9";
  const alice = await newAuthedClient(ip);
  await ageIdentity(alice.publicKeyB64, 90); // madura: cuota máxima, ráfaga = máximo/2
  const dailyLimit = dailyLimitFor(config.quota!, config.quota!.maxBytes);
  if (dailyLimit >= config.quota!.maxBytes) {
    return t.skip("con esta config la ráfaga diaria coincide con la cuota; nada que distinguir");
  }
  await seedUsage(alice.publicKeyB64, dailyLimit, 0); // ya ha agotado HOY, pero le sobra cuota

  const res = await app.inject({
    method: "POST",
    url: "/media",
    headers: upHeaders(alice, ip),
    payload: randomBytes(4096),
  });
  assert.equal(res.statusCode, 429, res.payload);
  assert.equal(res.json().error, "daily_limit");
  assert.ok(Number(res.headers["retry-after"]) > 0, "debe decir cuándo se reinicia el cubo diario");
});

test("subir descuenta cuota, y el barrido libera los cubos vencidos", async (t) => {
  if (!mediaOn || !quotaOn) return t.skip("S3 o cuota no configurados");
  const ip = "10.40.0.10";
  const alice = await newAuthedClient(ip);
  const payload = randomBytes(2048);

  const up = await app.inject({ method: "POST", url: "/media", headers: upHeaders(alice, ip), payload });
  assert.equal(up.statusCode, 201, up.payload);
  createdKeys.add(up.json().key as string);
  assert.equal(up.headers["x-aegis-quota-used"], "2048", "la subida debe cobrarse en la cabecera");

  // Un cubo ya vencido se libera en el barrido; el de hoy sobrevive.
  const ttlDays = Math.ceil(config.mediaTtlSeconds / 86_400);
  await seedUsage(alice.publicKeyB64, 999, -(ttlDays + 1));
  await deleteExpiredUsage(ttlDays);

  const after = await app.inject({
    method: "GET",
    url: "/media/quota",
    headers: { "x-forwarded-for": ip, authorization: `Bearer ${alice.token}` },
  });
  assert.equal(after.json().used, 2048, "el barrido debe liberar solo lo vencido");
});
