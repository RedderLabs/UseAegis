/**
 * Errores de la cripto compartida, **por código** en vez de por texto.
 *
 * Por qué existe este fichero: hasta ahora estos módulos vivían dentro de `apps/web` y lanzaban
 * `new Error(dict().errors.loQueSea)` — es decir, la cripto importaba el i18n de la web. Un paquete
 * que también tiene que correr en el cliente móvil no puede depender del diccionario de la web, pero
 * el usuario SÍ tiene que seguir leyendo estos mensajes en su idioma.
 *
 * La solución es invertir la dependencia: el paquete lanza un `AegisCryptoError` con un `code`
 * estable, y **quien tenga idioma** (la web, y mañana el móvil) instala un traductor con
 * `setCryptoErrorTranslator`. Sin traductor instalado, el mensaje cae al castellano por defecto
 * —exactamente el texto que se lanzaba antes—, así que los tests y Node siguen viendo lo mismo.
 *
 * El `code` es además lo que permite tratar un error por su significado (`err.code === "invalidPhrase"`)
 * en vez de comparando cadenas traducidas, que es un antipatrón que la app ya no necesita heredar.
 */

/** Códigos estables. Añadir uno es API pública: el traductor de cada app puede cubrirlo o no. */
export type CryptoErrorCode =
  // Semilla y frase de recuperación
  | "invalidSeed"
  | "invalidPhrase"
  | "phraseWrongLength"
  | "phraseNotAegis"
  | "invalidRecoveryCode"
  | "invalidRecoveryCodeBytes"
  | "phraseNotFoundInFile"
  // Acuerdo de claves y sobre
  | "invalidPeerKey"
  | "invalidSenderSignature"
  | "envelopeTooShort"
  | "unsupportedEnvelopeVersion"
  | "unknownMessageKind"
  // Cifrado por chunks de adjuntos
  | "invalidMediaKey"
  | "invalidChunkSize"
  | "mediaBlobTooShort"
  | "unsupportedMediaVersion"
  | "mediaFramingLen"
  | "mediaFramingOutOfRange"
  | "mediaNoChunks";

/** Datos que el mensaje necesita interpolar (p. ej. el número de palabras o la versión). */
export type CryptoErrorParams = Record<string, string | number>;

/**
 * Mensajes por defecto (castellano — el idioma por defecto de la app). Se usan cuando no hay
 * traductor instalado: Node, tests y cualquier consumidor sin i18n. Deben coincidir con el texto
 * que se lanzaba antes de mover la cripto a este paquete.
 */
const DEFAULT_MESSAGES: Record<CryptoErrorCode, (p: CryptoErrorParams) => string> = {
  invalidSeed: () => "Semilla inválida (se esperan 32 bytes).",
  invalidPhrase: () => "La frase de recuperación no es válida. Revisa las palabras y su orden.",
  phraseWrongLength: (p) => `Una frase de recuperación de Use Aegis tiene ${p.n} palabras.`,
  phraseNotAegis: () => "La frase no corresponde a una identidad de Use Aegis.",
  invalidRecoveryCode: () => "Código de recuperación inválido.",
  invalidRecoveryCodeBytes: () => "Código de recuperación inválido (se esperan 32 bytes).",
  phraseNotFoundInFile: () =>
    "No se encontró una frase de recuperación en el fichero. Pega tus 24 palabras o adjunta tu fichero de recuperación (.txt).",
  invalidPeerKey: () => "Clave pública X25519 del peer inválida (se esperan 32 bytes).",
  invalidSenderSignature: () => "Firma del remitente inválida.",
  envelopeTooShort: () => "Sobre demasiado corto.",
  unsupportedEnvelopeVersion: (p) => `Versión de sobre no soportada: ${p.version}.`,
  unknownMessageKind: () => "Tipo de mensaje desconocido.",
  invalidMediaKey: () => "Clave de media inválida.",
  invalidChunkSize: () => "chunkSize debe ser positivo.",
  mediaBlobTooShort: () => "Blob de media demasiado corto.",
  unsupportedMediaVersion: (p) => `Versión de media no soportada: ${p.version}.`,
  mediaFramingLen: () => "Framing de media corrupto (len).",
  mediaFramingOutOfRange: () => "Framing de media corrupto (chunk fuera de rango).",
  mediaNoChunks: () => "Media sin chunks.",
};

/** Error con código estable. `message` ya viene traducido si hay traductor instalado. */
export class AegisCryptoError extends Error {
  readonly code: CryptoErrorCode;
  readonly params: CryptoErrorParams;

  constructor(code: CryptoErrorCode, message: string, params: CryptoErrorParams = {}) {
    super(message);
    this.name = "AegisCryptoError";
    this.code = code;
    this.params = params;
  }
}

/**
 * Traductor de la app anfitriona. Devolver `undefined` para un código concreto es válido: ese
 * mensaje cae al texto por defecto (útil para los errores internos que no se enseñan al usuario).
 */
export type CryptoErrorTranslator = (
  code: CryptoErrorCode,
  params: CryptoErrorParams,
) => string | undefined;

let translator: CryptoErrorTranslator | null = null;

/**
 * Instala el traductor de la app. Se llama UNA vez al arrancar el cliente (en la web, desde
 * `lib/i18n/runtime`). Se resuelve en el momento de lanzar el error, no al instalarlo, para que
 * cambiar de idioma en caliente cambie también estos mensajes.
 */
export function setCryptoErrorTranslator(fn: CryptoErrorTranslator | null): void {
  translator = fn;
}

/** Construye el error resolviendo el idioma AHORA (ver `setCryptoErrorTranslator`). */
export function cryptoError(
  code: CryptoErrorCode,
  params: CryptoErrorParams = {},
): AegisCryptoError {
  const translated = translator?.(code, params);
  return new AegisCryptoError(code, translated ?? DEFAULT_MESSAGES[code](params), params);
}
