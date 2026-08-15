// Round-trip y pruebas negativas del sobre sealed-sender.
// Corre con: pnpm --filter @aegis/protocol test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSignedPrekey,
  fromBase64Url,
  generateSeed,
  publicKeyFromSeed,
  toBase64Url,
  x25519PublicFromSeed,
} from "@aegis/crypto-core";
import { ENVELOPE_VERSION, openEnvelope, sealEnvelope, verifyPeerPrekey } from "./envelope";

test("round-trip: sella y abre un texto E2E", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);
  const recipientX = x25519PublicFromSeed(recipientSeed);

  const blob = await sealEnvelope({
    senderSeed,
    recipientEd25519Pub: recipientEdPub,
    recipientX25519Pub: recipientX,
    message: { kind: "text", body: "hola por la .onion 🧅" },
  });

  const msg = await openEnvelope({ recipientSeed, recipientEd25519Pub: recipientEdPub, blob });
  assert.equal(msg.body, "hola por la .onion 🧅");
  assert.equal(msg.kind, "text");
  const senderEdPub = await publicKeyFromSeed(senderSeed);
  assert.equal(msg.senderPub, toBase64Url(senderEdPub), "el remitente se autentica correctamente");
});

test("manipular el blob → abrir lanza (integridad AEAD)", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);
  const recipientX = x25519PublicFromSeed(recipientSeed);

  const blob = await sealEnvelope({
    senderSeed,
    recipientEd25519Pub: recipientEdPub,
    recipientX25519Pub: recipientX,
    message: { kind: "text", body: "mensaje íntegro" },
  });
  const last = blob.length - 1;
  blob[last] = (blob[last]! ^ 0x01) & 0xff; // corromper un byte del ciphertext/tag

  await assert.rejects(
    openEnvelope({ recipientSeed, recipientEd25519Pub: recipientEdPub, blob }),
    "un blob manipulado no debe descifrar",
  );
});

test("otro destinatario no puede abrir el sobre", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const intruderSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);
  const recipientX = x25519PublicFromSeed(recipientSeed);

  const blob = await sealEnvelope({
    senderSeed,
    recipientEd25519Pub: recipientEdPub,
    recipientX25519Pub: recipientX,
    message: { kind: "text", body: "solo para el destinatario" },
  });

  const intruderEdPub = await publicKeyFromSeed(intruderSeed);
  await assert.rejects(
    openEnvelope({ recipientSeed: intruderSeed, recipientEd25519Pub: intruderEdPub, blob }),
    "un tercero no debe poder descifrar",
  );
});

test("verificación de prekey firmada (anti-MITM)", async () => {
  const seed = generateSeed();
  const edPub = await publicKeyFromSeed(seed);
  const { x25519PublicKey, signature } = await buildSignedPrekey(seed);

  assert.equal(await verifyPeerPrekey(edPub, x25519PublicKey, signature), true, "firma válida");

  const otherEdPub = await publicKeyFromSeed(generateSeed());
  assert.equal(
    await verifyPeerPrekey(otherEdPub, x25519PublicKey, signature),
    false,
    "firma que no corresponde a la identidad → rechazada",
  );
});

// --- Contrato de cable: lo que el móvil tiene que reproducir byte a byte -------------------

test("el blob tiene la forma documentada: version ‖ ephPub(32) ‖ nonce(24) ‖ ct", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);

  const blob = await sealEnvelope({
    senderSeed,
    recipientEd25519Pub: recipientEdPub,
    recipientX25519Pub: x25519PublicFromSeed(recipientSeed),
    message: { kind: "text", body: "x" },
  });

  assert.equal(blob[0], ENVELOPE_VERSION, "el primer byte es la versión del sobre");
  // 1 (version) + 32 (ephPub) + 24 (nonce) + al menos la etiqueta Poly1305 (16).
  assert.ok(blob.length >= 1 + 32 + 24 + 16);
});

test("una versión de sobre desconocida se rechaza por código", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);

  const blob = await sealEnvelope({
    senderSeed,
    recipientEd25519Pub: recipientEdPub,
    recipientX25519Pub: x25519PublicFromSeed(recipientSeed),
    message: { kind: "text", body: "del futuro" },
  });
  blob[0] = 99; // un sobre emitido por una versión posterior del protocolo

  await assert.rejects(
    openEnvelope({ recipientSeed, recipientEd25519Pub: recipientEdPub, blob }),
    (err: { code?: string; params?: { version?: number } }) =>
      err.code === "unsupportedEnvelopeVersion" && err.params?.version === 99,
  );
});

test("VECTOR CONGELADO: abre un sobre sellado por la implementación ANTERIOR", async () => {
  // Este blob lo produjo `apps/web/lib/crypto/messaging.ts` ANTES de mover la cripto a los
  // paquetes (cuando el HKDF y el SHA-256 los hacía Web Crypto y base64url usaba btoa/atob).
  // Que siga abriéndose es la prueba de que la mudanza no rompió ninguna identidad ya emitida
  // ni ningún mensaje en vuelo — y el vector que el cliente móvil tendrá que satisfacer.
  const BLOB =
    "AZ9SNocSmn85uRDAHjEUChUs6zuNkPMrYDiscSQPcOUzl7t5rMvs2uKgDoukPdpzNMsoxK5eSdoKhe2Sr4TGQMFP" +
    "FFwIX4Z9-RnIjSNA-qMIIN_pskvueCgKNpMchoE8pVgYF8CCdO8bZt893BhoBFxEYWEFrgrHbrP2K0wyySP4zm_o" +
    "FpFW2C5wNoY44q9q_fGRYeArQzCsYdjS489koF9Hc1GCaaiU57gDPO3cPYip0BuXQSBPoeg3L8wti2l6jBjsKqUS" +
    "91EWo51HdEr-ho8u6t3fbGxaI8AFOUqifFEV3hEb82-2wo-O1PZ6QUF5zyW43V1txeM09bSMTT6aisi-xY6wTFTT" +
    "n5bo3n4m8LJaKsEiDiJJYPQATW39sCwz4VZsSMpc4pEswdWhM4vbcbaqbe16SYAL0XM2Xr35jw2oZrM9Tg2fuf7K" +
    "kfDy8nROh9tf77I-3lvOSEgQptmIWjE";
  const SENDER_PUB = "5AMJmM_VrRcjwWn5VqoLnrhhm1mSvWEsKvQo68efjfA";
  const RECIPIENT_X25519 = "OBwh-6no8eSCuqiXYt--7XUZXrD3NKLk5zNRkBs3Vl4";
  const RECIPIENT_ED_PUB = "cf3-ltjeIkl3P_qpFPiuw1_FXzkKLcgHxn9IrfaN_TI";
  const BODY = "vector congelado — sellado por la implementación anterior";

  // Las semillas fijas con las que se generó (la del destinatario abre; la del remitente firma).
  const senderSeed = new Uint8Array(32).map((_, i) => (i * 7 + 1) % 256);
  const recipientSeed = new Uint8Array(32).map((_, i) => (i * 11 + 3) % 256);

  // 1) La derivación de claves da lo mismo que daba Web Crypto: mismas claves públicas.
  assert.equal(toBase64Url(await publicKeyFromSeed(senderSeed)), SENDER_PUB);
  assert.equal(toBase64Url(await publicKeyFromSeed(recipientSeed)), RECIPIENT_ED_PUB);
  assert.equal(toBase64Url(x25519PublicFromSeed(recipientSeed)), RECIPIENT_X25519);

  // 2) Y el sobre entero se abre y se autentica.
  const msg = await openEnvelope({
    recipientSeed,
    recipientEd25519Pub: fromBase64Url(RECIPIENT_ED_PUB),
    blob: fromBase64Url(BLOB),
  });
  assert.equal(msg.body, BODY);
  assert.equal(msg.kind, "text");
  assert.equal(msg.senderPub, SENDER_PUB);
});

test("kinds soportados: text, file y audio hacen round-trip", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);
  const recipientX = x25519PublicFromSeed(recipientSeed);

  for (const kind of ["text", "file", "audio"] as const) {
    const blob = await sealEnvelope({
      senderSeed,
      recipientEd25519Pub: recipientEdPub,
      recipientX25519Pub: recipientX,
      message: { kind, body: `cuerpo de ${kind}` },
    });
    const msg = await openEnvelope({ recipientSeed, recipientEd25519Pub: recipientEdPub, blob });
    assert.equal(msg.kind, kind);
    assert.equal(msg.body, `cuerpo de ${kind}`);
  }
});
