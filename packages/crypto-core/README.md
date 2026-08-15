# @aegis/crypto-core

## Qué hace

Las primitivas de Aegis, puras y portables: Ed25519 (identidad y firma), X25519 derivada de la
misma semilla (acuerdo de claves), XChaCha20-Poly1305 (contenido), AEAD por chunks (adjuntos),
HKDF-SHA256, base64url y la frase de recuperación BIP39.

Existe para que **la web y el cliente móvil deriven exactamente las mismas claves**. Una identidad
no es "una cuenta en un servidor", es una semilla de 32 bytes: si el móvil derivara un solo bit
distinto, esa identidad sería otra persona.

## Qué NO hace

No implementa criptografía propia. No decide transporte ni serialización del sobre (eso es
`@aegis/protocol`). **No persiste claves**: dónde se guarda la semilla es lo único que cambia de
verdad por plataforma —IndexedDB + Argon2id + AES-GCM en la web
(`apps/web/lib/crypto/identity-store.ts`), keychain del sistema en el móvil— y por eso se queda
fuera del paquete.

Tampoco habla idiomas. Lanza `AegisCryptoError` con un `code` estable y la app anfitriona instala
su traductor con `setCryptoErrorTranslator`; sin traductor, el mensaje cae al castellano.

## Portabilidad: lo que hubo que quitar

Tres ataduras al navegador, y ninguna cambia el resultado (`kdf.test.ts` y `bytes.test.ts`
comparan contra la implementación anterior):

| Antes (solo navegador)       | Ahora (web + Node + React Native) |
| ---------------------------- | --------------------------------- |
| `crypto.subtle` HKDF/SHA-256 | `@noble/hashes` (`kdf.ts`)        |
| `btoa` / `atob`              | base64url en JS puro (`bytes.ts`) |
| `dict()` del i18n de la web  | códigos de error (`errors.ts`)    |

Queda una dependencia de plataforma, concentrada en `random.ts`: `crypto.getRandomValues`. En
React Native hay que importar `react-native-get-random-values` antes que este paquete; si falta,
falla con un error explícito en vez de degradar el azar.

## Sobre "libsodium"

El roadmap original decía libsodium; la implementación usa `@noble` + `@scure`. Es deliberado:
están auditadas, funcionan igual en navegador/Node/RN sin WASM, y cambiarlas ahora obligaría a
migrar identidades ya emitidas sin ganar nada. La regla de `docs/PLANTILLA.md §5` (cero primitivos
propios) se cumple igual.

## Modelo de amenaza relevante

Protege la confidencialidad e integridad del contenido y la identidad del remitente (sealed
sender). No protege metadata de conexión ni el dispositivo comprometido (ver
`docs/THREAT_MODEL.md §3`).

## Dependencias externas

`@noble/ed25519`, `@noble/curves`, `@noble/ciphers`, `@noble/hashes`, `@scure/bip39` — todas
auditadas y de los mismos autores.

## Pendiente de revisión humana (`docs/PLANTILLA.md §5`)

`aead-stream.ts` (AEAD por chunks). La mudanza desde `apps/web/lib/crypto` no lo altera: es el
mismo código, con el mismo formato de blob.
