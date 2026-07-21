// Round-trip semilla↔frase, checksum y compatibilidad con el código base64url antiguo.
// Corre con: pnpm --filter @aegis/web exec tsx --test lib/crypto/recovery-phrase.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECOVERY_PHRASE_WORDS,
  decodeRecovery,
  isValidRecoveryPhrase,
  phraseToSeed,
  seedToPhrase,
} from "./recovery-phrase";
import { toBase64Url } from "./ed25519";

/** Vector estándar BIP39: 32 bytes a cero → 23×"abandon" + "art" (checksum conocido). */
const ZERO_SEED = new Uint8Array(32);
const ZERO_PHRASE = `${"abandon ".repeat(23)}art`;

test("vector estándar BIP39: semilla a cero → frase conocida", () => {
  assert.equal(seedToPhrase(ZERO_SEED), ZERO_PHRASE);
  assert.deepEqual(phraseToSeed(ZERO_PHRASE), ZERO_SEED);
});

test("son 24 palabras para 32 bytes", () => {
  const seed = new Uint8Array(32).map((_, i) => (i * 37 + 11) % 256);
  const phrase = seedToPhrase(seed);
  assert.equal(phrase.split(" ").length, RECOVERY_PHRASE_WORDS);
});

test("round-trip de una semilla arbitraria", () => {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (i * 97 + 3) % 256;
  assert.deepEqual(phraseToSeed(seedToPhrase(seed)), seed);
});

test("normaliza: mayúsculas y espacios de más no rompen la frase", () => {
  const messy = `  ${ZERO_PHRASE.toUpperCase().replace(/ /g, "   ")}  `;
  assert.ok(isValidRecoveryPhrase(messy));
  assert.deepEqual(phraseToSeed(messy), ZERO_SEED);
});

test("rechaza checksum roto (última palabra cambiada)", () => {
  const broken = `${"abandon ".repeat(23)}zoo`; // 24 palabras válidas, checksum incorrecto
  assert.equal(isValidRecoveryPhrase(broken), false);
  assert.throws(() => phraseToSeed(broken), /no es válida/);
});

test("rechaza palabra desconocida y número de palabras erróneo", () => {
  assert.throws(() => phraseToSeed(`${"abandon ".repeat(23)}notaword`));
  assert.throws(() => phraseToSeed("abandon abandon abandon"), /24 palabras/);
});

test("seedToPhrase exige 32 bytes", () => {
  assert.throws(() => seedToPhrase(new Uint8Array(16)));
});

test("decodeRecovery acepta frase BIP39", () => {
  assert.deepEqual(decodeRecovery(`  ${ZERO_PHRASE}  `), ZERO_SEED);
});

test("decodeRecovery acepta el código base64url ANTIGUO (compatibilidad)", () => {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (i * 13 + 7) % 256;
  assert.deepEqual(decodeRecovery(toBase64Url(seed)), seed);
});

test("decodeRecovery rechaza base64url que no son 32 bytes", () => {
  assert.throws(() => decodeRecovery(toBase64Url(new Uint8Array(16))));
});
