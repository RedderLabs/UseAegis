/**
 * Frase de recuperación BIP39 — codifica la semilla de identidad (32 bytes) como 24 palabras.
 *
 * La identidad de Aegis ES una semilla de 32 bytes (256 bits); de ella se derivan Ed25519 y
 * X25519 (ver identity-store.ts). BIP39 es SOLO una codificación distinta de esos mismos bytes:
 * 256 bits de entropía → 24 palabras con checksum. No es un cambio de cripto, es un cambio de
 * REPRESENTACIÓN — mucho más fácil de copiar a mano y con detección de errores (una palabra mal
 * o cambiada de orden rompe el checksum y se rechaza, en vez de restaurar una identidad basura).
 *
 * Usa `@scure/bip39` (auditada, de los mismos autores que `@noble`; no implementamos BIP39 propio,
 * ver docs/PLANTILLA.md §5). Lista de palabras en INGLÉS: es el estándar universal y, al no llevar
 * acentos ni ñ, minimiza los errores de transcripción y de normalización.
 *
 * Compatibilidad: `decodeRecovery` acepta TAMBIÉN el código antiguo (la semilla en base64url), para
 * que quien lo guardara antes de BIP39 pueda seguir importando su identidad.
 *
 * Módulo puro (bytes + strings): se ejecuta igual en el navegador y en Node (tests).
 */
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { fromBase64Url } from "./ed25519";

/** Tamaño de la semilla de identidad (256 bits). */
const SEED_BYTES = 32;

/** Número de palabras de la frase para una semilla de 32 bytes (256 bits → 24 palabras). */
export const RECOVERY_PHRASE_WORDS = 24;

/** Deja la frase en forma canónica: sin espacios de más, minúsculas, un solo espacio entre palabras. */
function normalizePhrase(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Codifica una semilla de 32 bytes como frase BIP39 de 24 palabras. */
export function seedToPhrase(seed: Uint8Array): string {
  if (seed.length !== SEED_BYTES) {
    throw new Error(`Semilla inválida: se esperan ${SEED_BYTES} bytes.`);
  }
  return entropyToMnemonic(seed, wordlist);
}

/** true si `input` es una frase de recuperación BIP39 válida (palabras conocidas + checksum). */
export function isValidRecoveryPhrase(input: string): boolean {
  return validateMnemonic(normalizePhrase(input), wordlist);
}

/**
 * Decodifica una frase BIP39 de 24 palabras de vuelta a la semilla de 32 bytes. Lanza con un
 * mensaje claro si la frase no es válida (palabra desconocida, orden cambiado, checksum roto) o
 * no corresponde a una identidad de Aegis (número de palabras equivocado).
 */
export function phraseToSeed(input: string): Uint8Array {
  const phrase = normalizePhrase(input);
  if (phrase.split(" ").length !== RECOVERY_PHRASE_WORDS) {
    throw new Error(`Una frase de recuperación de Aegis tiene ${RECOVERY_PHRASE_WORDS} palabras.`);
  }
  if (!validateMnemonic(phrase, wordlist)) {
    throw new Error("La frase de recuperación no es válida. Revisa las palabras y su orden.");
  }
  const seed = mnemonicToEntropy(phrase, wordlist);
  if (seed.length !== SEED_BYTES) {
    throw new Error("La frase no corresponde a una identidad de Aegis.");
  }
  return seed;
}

/**
 * Interpreta lo que el usuario pega al importar: una frase BIP39 (24 palabras) o el código de
 * recuperación ANTIGUO (semilla en base64url). Devuelve la semilla de 32 bytes o lanza.
 */
export function decodeRecovery(input: string): Uint8Array {
  const trimmed = input.trim();
  // Varias "palabras" separadas por espacios → tratar como frase BIP39.
  if (/\s/.test(trimmed)) {
    return phraseToSeed(trimmed);
  }
  // Un solo token → código antiguo en base64url.
  let seed: Uint8Array;
  try {
    seed = fromBase64Url(trimmed);
  } catch {
    throw new Error("Código de recuperación inválido.");
  }
  if (seed.length !== SEED_BYTES) {
    throw new Error("Código de recuperación inválido (se esperan 32 bytes).");
  }
  return seed;
}
