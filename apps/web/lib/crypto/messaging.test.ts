// Round-trip y pruebas negativas del sobre sealed-sender. Ejecutable en Node (Web Crypto +
// @noble). Corre con: pnpm --filter @aegis/web exec tsx --test lib/crypto/messaging.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSeed, publicKeyFromSeed, toBase64Url } from "./ed25519";
import { buildSignedPrekey, x25519PublicFromSeed } from "./x25519";
import { openEnvelope, sealEnvelope, verifyPeerPrekey } from "./messaging";

test("round-trip: sella y abre un texto E2E", async () => {
  const senderSeed = generateSeed();
  const recipientSeed = generateSeed();
  const recipientEdPub = await publicKeyFromSeed(recipientSeed);
  const recipientX = await x25519PublicFromSeed(recipientSeed);

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
  const recipientX = await x25519PublicFromSeed(recipientSeed);

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
  const recipientX = await x25519PublicFromSeed(recipientSeed);

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
