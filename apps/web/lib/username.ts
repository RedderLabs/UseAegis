/**
 * Generador de nombres de usuario LEGIBLES (palabra + número). El usuario NO teclea el nombre:
 * se genera aquí con CSPRNG y solo puede re-generarlo hasta que le guste. Así el campo del nombre
 * no tiene NINGUNA superficie de inyección (no hay texto libre) y, además, la validación se
 * replica igual que en el relay (defensa en profundidad): el relay es la autoridad, esto es solo
 * para no proponer nunca algo que el servidor rechazaría.
 *
 * Reglas (espejo de apps/relay/src/directory/directory.ts):
 *  - 3–20 chars, empieza por letra, solo minúsculas/dígitos/guion bajo.
 *  - No puede ser un nombre reservado (evita suplantar al equipo o roles de sistema).
 */

/** Debe coincidir con USERNAME_RE del relay. */
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

/** Debe coincidir con RESERVED_USERNAMES del relay. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin", "administrator", "administrador", "root", "system", "sys", "sistema",
  "support", "soporte", "help", "ayuda", "aegis", "official", "oficial", "staff",
  "team", "equipo", "mod", "moderator", "moderador", "security", "seguridad",
  "info", "contact", "contacto", "abuse", "noreply", "bot", "service", "servicio",
  "owner", "null", "undefined", "anonymous", "anonimo", "anon",
]);

// Palabras base neutras (naturaleza, minerales, espacio). Solo a–z, empiezan por letra, ninguna
// reservada. La palabra da legibilidad; el número la hace única.
const WORDS = [
  "nutria", "lince", "zorro", "halcon", "tejon", "garza", "buho", "mirlo", "ardilla",
  "castor", "delfin", "foca", "erizo", "tejo", "roble", "cedro", "sauce", "olivo",
  "pino", "abeto", "arce", "alamo", "fresno", "laurel", "helecho", "musgo", "brezo",
  "jara", "retama", "sierra", "valle", "duna", "faro", "brisa", "cometa", "nebula",
  "quasar", "pulsar", "orbita", "vega", "atlas", "cobre", "onix", "opalo", "ambar",
  "perla", "cuarzo", "zafiro", "granate", "jade", "coral", "marfil",
] as const;

/** Entero uniforme en [0, maxExclusive) con CSPRNG (nunca Math.random). */
function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % maxExclusive;
}

/** 4 dígitos aleatorios (CSPRNG) para desambiguar nombres repetidos. */
export function randomDiscriminator(): string {
  return String(randomInt(10000)).padStart(4, "0");
}

/** ¿Es un handle válido y no reservado? (misma regla que el relay). */
export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username) && !RESERVED_USERNAMES.has(username);
}

/**
 * Propone un nombre completo legible (palabra + número), siempre válido y no reservado.
 * Reintenta por si (improbablemente) saliera un candidato inválido.
 */
export function generateUsername(): string {
  for (let i = 0; i < 8; i++) {
    const candidate = `${WORDS[randomInt(WORDS.length)]}${randomDiscriminator()}`;
    if (isValidUsername(candidate)) return candidate;
  }
  // Salvaguarda (no debería alcanzarse): palabra fija + número.
  return `nutria${randomDiscriminator()}`;
}
