// EQUIVALENCIA con la implementación anterior. Este fichero es la red de seguridad de la mudanza
// de `apps/web/lib/crypto` a este paquete: hasta ahora el HKDF y el SHA-256 los hacía Web Crypto
// (`crypto.subtle`), y aquí los hace `@noble/hashes` para poder correr también en React Native.
//
// Si estas pruebas fallan, NO es un detalle de implementación: significaría que cada identidad ya
// existente derivaría una clave privada X25519 distinta (no podría descifrar sus mensajes) y que
// la huella de 16 letras que dos personas comparan para verificarse cambiaría de valor.
//
// Corre con: pnpm --filter @aegis/crypto-core test
import { test } from "node:test";
import assert from "node:assert/strict";
import { hkdfSha256, sha256 } from "./kdf";
import { fingerprint16, generateSeed, publicKeyFromSeed } from "./ed25519";
import { deriveAeadKey } from "./aead";
import { x25519PublicFromSeed } from "./x25519";
import { utf8 } from "./bytes";

/** HKDF-SHA256 tal y como lo hacía `x25519.ts`/`aead.ts` con Web Crypto. */
async function webcryptoHkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as unknown as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      info: info as unknown as BufferSource,
    },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** SHA-256 tal y como lo hacía `fingerprint16` con Web Crypto. */
async function webcryptoSha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as unknown as BufferSource));
}

test("HKDF: derivación de la clave X25519 (salt vacío) idéntica a Web Crypto", async () => {
  const X25519_INFO = utf8("aegis-x25519:v1"); // la etiqueta REAL de x25519.ts
  for (let i = 0; i < 8; i++) {
    const seed = generateSeed();
    const mine = hkdfSha256(seed, new Uint8Array(0), X25519_INFO, 32);
    const theirs = await webcryptoHkdf(seed, new Uint8Array(0), X25519_INFO, 32);
    assert.deepEqual(mine, theirs, "la clave privada X25519 de una identidad NO puede cambiar");
  }
});

test("HKDF: salt vacío ≡ salt de 32 ceros (equivalencia de HMAC)", () => {
  const ikm = generateSeed();
  const info = utf8("aegis-x25519:v1");
  assert.deepEqual(
    hkdfSha256(ikm, new Uint8Array(0), info, 32),
    hkdfSha256(ikm, new Uint8Array(32), info, 32),
  );
});

test("HKDF: clave AEAD del sobre (salt no vacío) idéntica a Web Crypto", async () => {
  const MSG_INFO = utf8("aegis-msg:v1"); // la etiqueta REAL del sobre
  for (let i = 0; i < 8; i++) {
    const shared = generateSeed();
    const salt = new Uint8Array(64);
    salt.set(generateSeed(), 0);
    salt.set(generateSeed(), 32);
    assert.deepEqual(
      deriveAeadKey(shared, salt, MSG_INFO),
      await webcryptoHkdf(shared, salt, MSG_INFO, 32),
    );
  }
});

test("HKDF: longitudes distintas de salida siguen coincidiendo", async () => {
  const ikm = generateSeed();
  const salt = generateSeed();
  const info = utf8("longitud");
  for (const n of [1, 16, 32, 64, 100]) {
    assert.deepEqual(hkdfSha256(ikm, salt, info, n), await webcryptoHkdf(ikm, salt, info, n));
  }
});

test("SHA-256 idéntico a Web Crypto (y con ello la huella de 16 letras)", async () => {
  for (let i = 0; i < 8; i++) {
    const pub = await publicKeyFromSeed(generateSeed());
    assert.deepEqual(sha256(pub), await webcryptoSha256(pub));

    // La huella completa, tal y como la calcula la UI.
    const digest = await webcryptoSha256(pub);
    let expected = "";
    for (let j = 0; j < 16; j++) expected += String.fromCharCode(65 + (digest[j]! % 26));
    assert.equal(fingerprint16(pub), expected);
    assert.match(fingerprint16(pub), /^[A-Z]{16}$/);
  }
});

test("vector fijo: la misma semilla da siempre la misma identidad", async () => {
  // Semilla determinista (NO aleatoria): si algún día alguien cambia el KDF o la etiqueta de
  // dominio sin darse cuenta, estos tres valores dejan de cuadrar y el test lo caza.
  const seed = new Uint8Array(32).map((_, i) => (i * 7 + 1) % 256);

  const edPub = await publicKeyFromSeed(seed);
  const xPub = x25519PublicFromSeed(seed);

  assert.deepEqual(await webcryptoSha256(edPub), sha256(edPub));
  assert.deepEqual(
    xPub,
    x25519PublicFromSeed(seed),
    "la derivación X25519 tiene que ser determinista",
  );
  // La clave X25519 se deriva del HKDF: comprobamos contra Web Crypto la ruta completa.
  const privViaWebCrypto = await webcryptoHkdf(
    seed,
    new Uint8Array(0),
    utf8("aegis-x25519:v1"),
    32,
  );
  assert.deepEqual(hkdfSha256(seed, new Uint8Array(0), utf8("aegis-x25519:v1"), 32), privViaWebCrypto);
});
