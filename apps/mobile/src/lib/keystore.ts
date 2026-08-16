/**
 * Almacén de la semilla en el móvil — LO ÚNICO que de verdad cambia de plataforma.
 *
 * La web guarda la semilla en IndexedDB cifrada con Argon2id + AES-GCM: tiene que hacerlo porque el
 * navegador no le ofrece nada mejor. En el móvil eso sería peor, no mejor: el sistema ya tiene un
 * almacén respaldado por hardware (Keychain en iOS, Keystore en Android) al que la app no puede
 * llegar sin que el usuario se autentique. Reimplementar Argon2id encima solo añadiría una
 * dependencia nativa más y una contraseña más que recordar, sin ganar nada.
 *
 * Consecuencia honesta: la protección de la semilla en el móvil es tan buena como el bloqueo del
 * dispositivo. Es un compromiso distinto al de la web, no el mismo — y por eso está escrito aquí.
 *
 * La semilla NUNCA sale de este módulo hacia la UI: se expone lo que se puede hacer CON ella
 * (`publicKey()`, `sign()`), igual que hace `identity-store.ts` en la web.
 */
import * as SecureStore from "expo-secure-store";
import { generateSeed, publicKeyFromSeed, signWithSeed, toBase64Url } from "@aegis/crypto-core";

/** Clave del elemento en el llavero del sistema. */
const SEED_KEY = "aegis.identity.seed.v1";

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Sin esto, en iOS el elemento entra en las copias de seguridad y puede acabar en otro
  // dispositivo. La identidad no se restaura desde un backup: se restaura desde la frase BIP39.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Semilla en memoria mientras la app está viva. Se borra al bloquear (`lock()`). */
let unlocked: Uint8Array | null = null;

function requireSeed(): Uint8Array {
  if (!unlocked) throw new Error("El llavero está bloqueado: no hay identidad cargada.");
  return unlocked;
}

/** ¿Hay ya una identidad guardada en este dispositivo? */
export async function hasIdentity(): Promise<boolean> {
  return (await SecureStore.getItemAsync(SEED_KEY, OPTIONS)) !== null;
}

/**
 * Crea una identidad NUEVA y la guarda en el llavero. Falla si ya hay una: sobrescribirla sin
 * querer significaría perder la identidad para siempre (la semilla es la identidad).
 */
export async function createIdentity(): Promise<string> {
  if (await hasIdentity()) throw new Error("Ya hay una identidad en este dispositivo.");
  const seed = generateSeed();
  await SecureStore.setItemAsync(SEED_KEY, toBase64Url(seed), OPTIONS);
  unlocked = seed;
  return toBase64Url(await publicKeyFromSeed(seed));
}

/** Carga la identidad del llavero a memoria. Devuelve la clave pública en base64url. */
export async function unlockIdentity(): Promise<string> {
  const stored = await SecureStore.getItemAsync(SEED_KEY, OPTIONS);
  if (!stored) throw new Error("No hay ninguna identidad guardada en este dispositivo.");
  const { fromBase64Url } = await import("@aegis/crypto-core");
  unlocked = fromBase64Url(stored);
  return toBase64Url(await publicKeyFromSeed(unlocked));
}

/** Olvida la semilla de memoria (no la borra del llavero). */
export function lock(): void {
  unlocked = null;
}

/** Firma con la identidad desbloqueada. Es lo que consume el challenge-response del relay. */
export function sign(message: Uint8Array): Promise<Uint8Array> {
  return signWithSeed(requireSeed(), message);
}

/** Clave pública Ed25519 (base64url) de la identidad desbloqueada. */
export async function publicKey(): Promise<string> {
  return toBase64Url(await publicKeyFromSeed(requireSeed()));
}
