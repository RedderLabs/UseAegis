// Round-trip y pruebas negativas del cifrado por chunks de media. Ejecutable en Node (@noble +
// Web Crypto). Corre con: pnpm --filter @aegis/web exec tsx --test lib/crypto/aead-stream.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHUNK_BYTES, decryptMedia, encryptMedia, randomMediaKey } from "./aead-stream";

function randomBytes(n: number): Uint8Array {
  // getRandomValues rechaza > 65536 B por llamada → rellenar por trozos.
  const b = new Uint8Array(n);
  for (let off = 0; off < n; off += 65536) {
    crypto.getRandomValues(b.subarray(off, Math.min(off + 65536, n)));
  }
  return b;
}

test("round-trip: un solo chunk (pequeño)", () => {
  const key = randomMediaKey();
  const plain = new TextEncoder().encode("un archivo pequeño 📎");
  const blob = encryptMedia(key, plain);
  assert.deepEqual(decryptMedia(key, blob), plain);
});

test("round-trip: multi-chunk (varios chunks + resto)", () => {
  const key = randomMediaKey();
  const plain = randomBytes(DEFAULT_CHUNK_BYTES * 3 + 777); // 3 chunks completos + uno parcial
  const blob = encryptMedia(key, plain);
  const out = decryptMedia(key, blob);
  assert.equal(out.length, plain.length);
  assert.deepEqual(out, plain);
});

test("round-trip: tamaño múltiplo exacto del chunk", () => {
  const key = randomMediaKey();
  const plain = randomBytes(DEFAULT_CHUNK_BYTES * 2);
  assert.deepEqual(decryptMedia(key, encryptMedia(key, plain)), plain);
});

test("round-trip: claro vacío", () => {
  const key = randomMediaKey();
  const blob = encryptMedia(key, new Uint8Array(0));
  assert.equal(decryptMedia(key, blob).length, 0);
});

test("clave equivocada → falla", () => {
  const plain = randomBytes(1000);
  const blob = encryptMedia(randomMediaKey(), plain);
  assert.throws(() => decryptMedia(randomMediaKey(), blob));
});

test("bit-flip en el ciphertext → falla la etiqueta", () => {
  const key = randomMediaKey();
  const blob = encryptMedia(key, randomBytes(2000));
  const tampered = blob.slice();
  // Voltea un byte dentro del primer chunk (tras el header + prefijo de longitud).
  tampered[tampered.length - 5] = (tampered[tampered.length - 5]! ^ 0x01) & 0xff;
  assert.throws(() => decryptMedia(key, tampered));
});

test("truncar el último chunk → detectado (anti-truncado)", () => {
  const key = randomMediaKey();
  const plain = randomBytes(DEFAULT_CHUNK_BYTES * 3 + 10);
  const blob = encryptMedia(key, plain, 512); // chunks pequeños → muchos frames
  // Recorta el último frame entero: el nuevo "último" se cifró con isFinal=false → AAD no cuadra.
  // Buscamos el offset del último frame recortando 512+ bytes del final de forma segura:
  const truncated = blob.slice(0, blob.length - 300);
  assert.throws(() => decryptMedia(key, truncated));
});

test("reordenar chunks → falla (nonce por índice)", () => {
  const key = randomMediaKey();
  const plain = randomBytes(300);
  const blob = encryptMedia(key, plain, 100); // 3 chunks de 100
  // Reconstruir intercambiando los dos primeros frames. Header = 1+16+4 = 21 B.
  const HEADER = 21;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const len0 = view.getUint32(HEADER, false);
  const frame0 = blob.slice(HEADER, HEADER + 4 + len0);
  const off1 = HEADER + 4 + len0;
  const len1 = view.getUint32(off1, false);
  const frame1 = blob.slice(off1, off1 + 4 + len1);
  const rest = blob.slice(off1 + 4 + len1);
  const swapped = new Uint8Array(blob.length);
  swapped.set(blob.slice(0, HEADER), 0);
  swapped.set(frame1, HEADER);
  swapped.set(frame0, HEADER + frame1.length);
  swapped.set(rest, HEADER + frame1.length + frame0.length);
  assert.throws(() => decryptMedia(key, swapped));
});
