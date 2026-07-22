// Round-trip semilla↔frase, checksum y compatibilidad con el código base64url antiguo.
// Corre con: pnpm --filter @aegis/web exec tsx --test lib/crypto/recovery-phrase.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECOVERY_PHRASE_WORDS,
  decodeAnyRecovery,
  decodeRecovery,
  extractRecoveryFromText,
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

// --- Extracción desde el fichero .txt descargado en el registro -------------------------

/** Reproduce EXACTAMENTE el fichero que genera register/page.tsx::downloadRecovery(). */
function registerTxt(phrase: string, fingerprint = "VXISARJXMHLCHTQJ"): string {
  const numbered = phrase
    .split(" ")
    .map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`)
    .join("\n");
  return [
    "AEGIS — Frase de recuperación de identidad",
    "",
    `Huella pública: ${fingerprint}`,
    "",
    "Frase de recuperación (24 palabras — mantenla en secreto, es tu clave privada):",
    "",
    phrase,
    "",
    numbered,
    "",
    "Con estas 24 palabras, EN ESTE ORDEN, puedes restaurar tu identidad en otro dispositivo.",
    "No hay servidor con tus claves: si la pierdes, nadie puede recuperarla por ti.",
  ].join("\n");
}

test("extractRecoveryFromText: rescata la frase del fichero .txt entero del registro", () => {
  const txt = registerTxt(ZERO_PHRASE);
  assert.equal(extractRecoveryFromText(txt), ZERO_PHRASE);
  assert.deepEqual(decodeRecovery(extractRecoveryFromText(txt)), ZERO_SEED);
});

test("extractRecoveryFromText: reconstruye desde solo la lista numerada", () => {
  const numbered = ZERO_PHRASE.split(" ")
    .map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`)
    .join("\n");
  assert.equal(extractRecoveryFromText(numbered), ZERO_PHRASE);
});

test("extractRecoveryFromText: acepta las 24 palabras pegadas tal cual", () => {
  assert.equal(extractRecoveryFromText(`  ${ZERO_PHRASE}  `), ZERO_PHRASE);
});

test("extractRecoveryFromText: rescata el código base64url antiguo de un fichero", () => {
  const seed = new Uint8Array(32).map((_, i) => (i * 29 + 5) % 256);
  const code = toBase64Url(seed);
  const txt = `AEGIS — Código de recuperación\n\n${code}\n`;
  assert.equal(extractRecoveryFromText(txt), code);
});

test("extractRecoveryFromText: lanza si no hay ninguna frase válida", () => {
  assert.throws(() => extractRecoveryFromText("esto no contiene ninguna frase de recuperacion"));
});

test("decodeAnyRecovery: funciona con palabras pegadas Y con el fichero entero", () => {
  assert.deepEqual(decodeAnyRecovery(ZERO_PHRASE), ZERO_SEED); // pegado
  assert.deepEqual(decodeAnyRecovery(registerTxt(ZERO_PHRASE)), ZERO_SEED); // fichero completo
});
