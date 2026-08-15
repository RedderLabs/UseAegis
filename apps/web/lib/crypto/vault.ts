/**
 * Vault local: cifra la semilla Ed25519 en reposo con una passphrase del usuario.
 *
 * Modelo de equipo compartido (docs/ARQUITECTURA.md §2, "Argon2id: derivación de clave
 * desde passphrase local"): la semilla NUNCA se guarda en claro. Se sella con una clave
 * derivada de la passphrase por **Argon2id** (memory-hard, resistente a fuerza bruta por
 * GPU/ASIC) y se cifra con **AES-256-GCM** (AEAD nativo de Web Crypto — sin código propio
 * que auditar). Sin la passphrase, lo almacenado es ruido: otra persona en el mismo equipo
 * no puede usar la identidad.
 *
 * Argon2id lo aporta `@noble/hashes` (auditado); no implementamos KDFs propios
 * (docs/PLANTILLA.md §5). Solo se ejecuta en navegador (Web Crypto).
 *
 * Se queda en la app y NO baja a `@aegis/crypto-core` a propósito: AES-GCM aquí lo pone Web
 * Crypto, que no existe en React Native, y el sitio donde se guarda una identidad es justo lo
 * que cambia por plataforma (IndexedDB aquí, keychain del sistema en el móvil). Lo que sí es
 * común —la semilla y todo lo que se deriva de ella— ya vive en el paquete.
 */
import { argon2id } from "@noble/hashes/argon2";
import { dict } from "../i18n/runtime";

// Parámetros Argon2id. Se guardan DENTRO del blob para poder endurecerlos en el futuro
// sin invalidar los vaults ya creados. OWASP: mínimo m=19 MiB, t=2, p=1.
const DEFAULT_KDF = { t: 3, m: 19_456, p: 1 } as const;
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM
const KEY_BYTES = 32; // AES-256

export interface KdfParams {
  t: number; // iteraciones (time cost)
  m: number; // memoria en KiB
  p: number; // paralelismo
}

/** Blob cifrado que se persiste. No contiene ni la semilla ni la passphrase. */
export interface VaultBlob {
  v: 1;
  kdf: KdfParams;
  salt: Uint8Array; // sal de Argon2id
  iv: Uint8Array; // nonce de AES-GCM
  ct: Uint8Array; // AES-256-GCM(seed) con tag incluido
}

const enc = new TextEncoder();

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  kdf: KdfParams,
): Promise<CryptoKey> {
  // NFKC: dos passphrases visualmente iguales derivan la misma clave.
  const pw = enc.encode(passphrase.normalize("NFKC"));
  const raw = argon2id(pw, salt, { t: kdf.t, m: kdf.m, p: kdf.p, dkLen: KEY_BYTES });
  return crypto.subtle.importKey("raw", raw as unknown as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Sella una semilla (32 bytes) con la passphrase. Genera sal e IV aleatorios nuevos. */
export async function sealSeed(seed: Uint8Array, passphrase: string): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt, DEFAULT_KDF);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      seed as unknown as BufferSource,
    ),
  );
  return { v: 1, kdf: { ...DEFAULT_KDF }, salt, iv, ct };
}

/**
 * Abre un vault con la passphrase y devuelve la semilla. Lanza "Passphrase incorrecta"
 * si el tag GCM no valida (passphrase errónea o blob manipulado) — sin distinguir el
 * caso, para no dar un oráculo.
 */
export async function openSeed(blob: VaultBlob, passphrase: string): Promise<Uint8Array> {
  const key = await deriveAesKey(passphrase, blob.salt, blob.kdf);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.iv as unknown as BufferSource },
      key,
      blob.ct as unknown as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    throw new Error(dict().errors.wrongPassphrase);
  }
}
