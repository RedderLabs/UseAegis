// Round-trip y pruebas negativas del códec de URI de contacto (el contenido del QR).
// Corre con: pnpm --filter @aegis/web exec tsx --test lib/contact-uri.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTACT_URI_PREFIX, encodeContactUri, parseContactUri } from "./contact-uri";
import { toBase64Url } from "./crypto";

/** Una clave pública Ed25519 de juguete: 32 bytes deterministas en base64url. */
function fakePub(seed = 7): string {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = (seed * (i + 1)) % 256;
  return toBase64Url(b);
}

test("round-trip: clave + handle", () => {
  const pub = fakePub();
  const uri = encodeContactUri({ pub, handle: "alicia7" });
  assert.equal(uri, `${CONTACT_URI_PREFIX}?k=${pub}&h=alicia7`);
  assert.deepEqual(parseContactUri(uri), { pub, handle: "alicia7" });
});

test("round-trip: sin handle", () => {
  const pub = fakePub(3);
  const uri = encodeContactUri({ pub, handle: null });
  assert.equal(uri, `${CONTACT_URI_PREFIX}?k=${pub}`);
  assert.deepEqual(parseContactUri(uri), { pub, handle: null });
});

test("normaliza el handle: quita @ y baja a minúsculas", () => {
  const pub = fakePub(9);
  assert.equal(encodeContactUri({ pub, handle: "@Alicia7" }), `${CONTACT_URI_PREFIX}?k=${pub}&h=alicia7`);
});

test("handle inválido se descarta (no rompe la URI)", () => {
  const pub = fakePub(9);
  // Espacios / símbolos no forman un handle válido → se omite, la clave se conserva.
  assert.equal(encodeContactUri({ pub, handle: "no vale!" }), `${CONTACT_URI_PREFIX}?k=${pub}`);
});

test("acepta una clave pública suelta (sin esquema)", () => {
  const pub = fakePub(11);
  assert.deepEqual(parseContactUri(`  ${pub}  `), { pub, handle: null });
});

test("rechaza clave que no son 32 bytes", () => {
  const short = toBase64Url(new Uint8Array(16));
  assert.equal(parseContactUri(`${CONTACT_URI_PREFIX}?k=${short}`), null);
  assert.throws(() => encodeContactUri({ pub: short, handle: null }));
});

test("rechaza versión / esquema desconocidos y basura", () => {
  const pub = fakePub();
  assert.equal(parseContactUri(`aegis://contact/v2?k=${pub}`), null);
  assert.equal(parseContactUri(`https://evil.example/?k=${pub}`), null);
  assert.equal(parseContactUri("hola qué tal"), null);
  assert.equal(parseContactUri(""), null);
});

test("ignora parámetros extra pero exige k válido", () => {
  const pub = fakePub(5);
  assert.deepEqual(parseContactUri(`${CONTACT_URI_PREFIX}?k=${pub}&h=bob99&x=basura`), {
    pub,
    handle: "bob99",
  });
  assert.equal(parseContactUri(`${CONTACT_URI_PREFIX}?h=bob99`), null);
});
