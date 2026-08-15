/**
 * Conecta los errores de `@aegis/crypto-core` / `@aegis/protocol` con el diccionario de la web.
 *
 * Los paquetes compartidos no pueden importar el i18n de esta app (también tienen que correr en el
 * cliente móvil), así que lanzan un error con un `code` estable y dejan que la app anfitriona ponga
 * el texto. Este módulo es esa app poniendo el texto: importarlo instala el traductor.
 *
 * El código coincide a propósito con la clave del diccionario (`invalidPhrase`, `phraseWrongLength`…):
 * añadir un error nuevo al paquete y su traducción a `dictionaries/es.ts` + `en.ts` es todo lo que
 * hace falta. Un código sin entrada en el diccionario NO rompe nada: cae al mensaje por defecto del
 * paquete (castellano), que es exactamente lo que se lanzaba antes de separar los paquetes.
 *
 * Importa `@aegis/crypto-core/errors` —el subcamino, no el barril— para no arrastrar la cripto
 * entera (ni el wordlist BIP39) a cualquier chunk que solo necesite traducir un mensaje.
 */
import { setCryptoErrorTranslator } from "@aegis/crypto-core/errors";
import { dict } from "./runtime";

setCryptoErrorTranslator((code, params) => {
  const entry = (dict().errors as Record<string, unknown>)[code];
  // Mensajes con datos (p. ej. `phraseWrongLength(24)`) son funciones en el diccionario.
  if (typeof entry === "function") {
    return (entry as (...args: unknown[]) => string)(...Object.values(params));
  }
  return typeof entry === "string" ? entry : undefined;
});
