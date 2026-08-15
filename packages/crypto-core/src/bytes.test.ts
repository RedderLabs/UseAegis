// EQUIVALENCIA con la implementación anterior (btoa/atob). Base64url es la forma en que una clave
// pública viaja por un QR, por el directorio del relay y dentro del sobre: si esta codificación
// cambiara, los QR `aegis://contact` ya compartidos dejarían de resolver a la misma identidad.
//
// Corre con: pnpm --filter @aegis/crypto-core test
import { test } from "node:test";
import assert from "node:assert/strict";
import { concatBytes, fromBase64Url, fromUtf8, toBase64Url, utf8 } from "./bytes";
import { randomBytes } from "./random";

/** La implementación ANTERIOR, literal, para comparar contra ella. */
function legacyToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function legacyFromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

test("toBase64Url: idéntico a btoa para todas las longitudes de resto (0/1/2)", () => {
  for (let n = 0; n <= 70; n++) {
    const bytes = randomBytes(n);
    assert.equal(toBase64Url(bytes), legacyToBase64Url(bytes), `longitud ${n}`);
  }
});

test("toBase64Url: cubre los 256 valores de byte", () => {
  const all = new Uint8Array(256).map((_, i) => i);
  assert.equal(toBase64Url(all), legacyToBase64Url(all));
});

test("fromBase64Url: idéntico a atob (round-trip contra la implementación vieja)", () => {
  for (let n = 0; n <= 70; n++) {
    const bytes = randomBytes(n);
    const encoded = legacyToBase64Url(bytes);
    assert.deepEqual(fromBase64Url(encoded), legacyFromBase64Url(encoded), `longitud ${n}`);
    assert.deepEqual(fromBase64Url(encoded), bytes);
  }
});

test("fromBase64Url: acepta base64 estándar y el relleno '=' (entrada tolerante)", () => {
  const bytes = randomBytes(32);
  const b64url = toBase64Url(bytes);
  const standard = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  assert.deepEqual(fromBase64Url(standard), bytes);
  assert.deepEqual(fromBase64Url(padded), bytes);
});

test("fromBase64Url: lanza ante un carácter que no es base64 (como hacía atob)", () => {
  assert.throws(() => fromBase64Url("no es base64!"));
  assert.throws(() => fromBase64Url("AAAA*AAA"));
  // Y el consumidor distingue ese caso del de "es base64 pero no mide 32 bytes":
  assert.equal(fromBase64Url(toBase64Url(randomBytes(16))).length, 16);
});

test("concatBytes y utf8/fromUtf8", () => {
  assert.deepEqual(
    concatBytes(Uint8Array.of(1, 2), new Uint8Array(0), Uint8Array.of(3)),
    Uint8Array.of(1, 2, 3),
  );
  assert.equal(fromUtf8(utf8("hola por la .onion 🧅")), "hola por la .onion 🧅");
});
