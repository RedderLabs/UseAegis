/**
 * Frase de recuperación BIP39 — codifica la semilla de identidad (32 bytes) como 24 palabras.
 *
 * La identidad de Aegis ES una semilla de 32 bytes (256 bits); de ella se derivan Ed25519 y
 * X25519. BIP39 es SOLO una codificación distinta de esos mismos bytes: 256 bits de entropía →
 * 24 palabras con checksum. No es un cambio de cripto, es un cambio de REPRESENTACIÓN — mucho más
 * fácil de copiar a mano y con detección de errores (una palabra mal o cambiada de orden rompe el
 * checksum y se rechaza, en vez de restaurar una identidad basura).
 *
 * Usa `@scure/bip39` (auditada, de los mismos autores que `@noble`; no implementamos BIP39 propio,
 * ver docs/PLANTILLA.md §5). Lista de palabras en INGLÉS: es el estándar universal y, al no llevar
 * acentos ni ñ, minimiza los errores de transcripción y de normalización.
 *
 * Compatibilidad: `decodeRecovery` acepta TAMBIÉN el código antiguo (la semilla en base64url), para
 * que quien lo guardara antes de BIP39 pueda seguir importando su identidad.
 *
 * Vive en el paquete compartido porque restaurar una identidad desde las 24 palabras tiene que dar
 * exactamente la misma semilla en la web y en el móvil: es lo que hace que una identidad sea
 * portable entre dispositivos.
 */
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { fromBase64Url } from "./bytes";
import { cryptoError } from "./errors";

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
    throw cryptoError("invalidSeed");
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
    throw cryptoError("phraseWrongLength", { n: RECOVERY_PHRASE_WORDS });
  }
  if (!validateMnemonic(phrase, wordlist)) {
    throw cryptoError("invalidPhrase");
  }
  const seed = mnemonicToEntropy(phrase, wordlist);
  if (seed.length !== SEED_BYTES) {
    throw cryptoError("phraseNotAegis");
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
    throw cryptoError("invalidRecoveryCode");
  }
  if (seed.length !== SEED_BYTES) {
    throw cryptoError("invalidRecoveryCodeBytes");
  }
  return seed;
}

/** true si `token` (un solo campo, sin espacios) es un código de recuperación antiguo válido. */
function isOldRecoveryCode(token: string): boolean {
  try {
    return fromBase64Url(token).length === SEED_BYTES;
  } catch {
    return false;
  }
}

/**
 * Extrae la recuperación de un TEXTO arbitrario — p. ej. el fichero descargado en el registro
 * (`aegis-recuperacion-*.txt`), que además de la frase lleva una cabecera ("Huella pública…") y
 * una lista numerada. Devuelve la frase BIP39 canónica (24 palabras) o el código base64url
 * antiguo, listo para `decodeRecovery`. Lanza si no encuentra ninguna recuperación válida.
 *
 * Es tolerante a propósito: el usuario a menudo ADJUNTA el .txt entero en vez de pegar solo las
 * palabras, y el objetivo es que "adjuntar mi fichero de recuperación" simplemente funcione.
 */
export function extractRecoveryFromText(text: string): string {
  // 1) ¿El texto entero YA es una recuperación válida? (frase pegada tal cual, o código suelto)
  const whole = text.trim();
  if (isValidRecoveryPhrase(whole)) return normalizePhrase(whole);
  if (!/\s/.test(whole) && isOldRecoveryCode(whole)) return whole;

  // 2) Línea a línea: el .txt lleva la frase completa en su propia línea (y, de haberlo, el
  //    código antiguo suelto en otra).
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const norm = normalizePhrase(line);
    if (norm && isValidRecoveryPhrase(norm)) return norm;
    const token = line.trim();
    if (token && !/\s/.test(token) && isOldRecoveryCode(token)) return token;
  }

  // 3) Reconstruye desde la lista numerada ("1. exchange", "2. enemy", …) como último recurso.
  const numbered = lines
    .map((l) => l.match(/^\s*\d+\.\s*([a-z]+)\s*$/i)?.[1])
    .filter((w): w is string => w !== undefined)
    .map((w) => w.toLowerCase());
  if (numbered.length === RECOVERY_PHRASE_WORDS) {
    const phrase = numbered.join(" ");
    if (isValidRecoveryPhrase(phrase)) return phrase;
  }

  throw cryptoError("phraseNotFoundInFile");
}

/**
 * Decodifica CUALQUIER forma de recuperación a la semilla de 32 bytes: lo que el usuario pega
 * (24 palabras o código antiguo) o el fichero entero adjuntado (con cabecera y lista numerada).
 * Es el punto de entrada que usa la UI de importación.
 */
export function decodeAnyRecovery(input: string): Uint8Array {
  try {
    return decodeRecovery(input);
  } catch {
    // No era una recuperación "limpia": quizá sea el fichero .txt completo. Intenta extraerla.
    return decodeRecovery(extractRecoveryFromText(input));
  }
}
