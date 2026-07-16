/**
 * Generador de contraseñas fuertes (estilo gestor de contraseñas) para la CONTRASEÑA de la
 * bóveda. Aquí SÍ tiene sentido la máxima entropía: esta contraseña nunca se pinta como HTML ni
 * entra en consultas; solo cifra la semilla en el dispositivo (Argon2id). Usa CSPRNG (Web Crypto),
 * nunca Math.random.
 *
 * Garantiza al menos un carácter de cada clase seleccionada para no producir contraseñas débiles
 * por azar, y baraja el resultado con Fisher–Yates sobre el mismo CSPRNG.
 */

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%&*?+-_=";

export const PASSWORD_LENGTHS = [16, 24, 32] as const;

/** Índice uniforme en [0, n) con CSPRNG. */
function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % n;
}

function pick(chars: string): string {
  return chars[randomIndex(chars.length)]!;
}

/**
 * Genera una contraseña de `length` caracteres. Siempre incluye minúsculas, mayúsculas y dígitos;
 * `symbols` añade además caracteres especiales. `length` se acota a un rango sensato.
 */
export function generatePassword(length = 24, symbols = true): string {
  const len = Math.max(12, Math.min(64, Math.floor(length)));
  const classes = [LOWER, UPPER, DIGITS, ...(symbols ? [SYMBOLS] : [])];
  const all = classes.join("");

  // Un carácter garantizado de cada clase, el resto del conjunto completo.
  const out: string[] = classes.map((c) => pick(c));
  while (out.length < len) out.push(pick(all));

  // Barajar (Fisher–Yates) para que los caracteres garantizados no queden al principio.
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.join("");
}
