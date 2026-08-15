/**
 * Frase de recuperación BIP39 — reexporta `@aegis/crypto-core/recovery-phrase`.
 *
 * Se mantiene como módulo propio (en vez de reexportarlo desde `./index`) porque arrastra el
 * wordlist BIP39 (~12 kB) y varios sitios lo cargan BAJO DEMANDA (`await import(...)`) justo para
 * no meterlo en todas las páginas del panel. Reexportarlo desde el barril lo metería en el grafo
 * estático de cualquiera que importe la fachada y esa carga perezosa dejaría de servir de nada.
 *
 * Importa el traductor de errores por su subcamino, por el mismo motivo: que este chunk siga
 * llevando solo BIP39 y no la cripto entera.
 */
import "../i18n/crypto-errors";

export {
  RECOVERY_PHRASE_WORDS,
  decodeAnyRecovery,
  decodeRecovery,
  extractRecoveryFromText,
  isValidRecoveryPhrase,
  phraseToSeed,
  seedToPhrase,
} from "@aegis/crypto-core/recovery-phrase";
