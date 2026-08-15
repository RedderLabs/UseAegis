# @aegis/protocol

## Qué hace

El **sobre sealed-sender**: sellar un mensaje para alguien, abrirlo verificando la firma del
remitente, y comprobar que la prekey de un contacto está firmada por su identidad (anti-MITM).
Idéntico para relay, P2P y mesh.

Es el **contrato de cable**: `version(1) ‖ ephPub(32) ‖ nonce(24) ‖ ciphertext`. El cliente móvil
tiene que producir y consumir exactamente estos bytes para que una conversación siga funcionando
cuando alguien cambia de dispositivo.

## Qué NO hace

No cifra primitivos (eso es `@aegis/crypto-core`) ni mueve bytes (eso es `@aegis/transport`).
Define la forma exacta que esos bytes tienen.

## Por qué está separado de `crypto-core`

Son dos compatibilidades distintas: `crypto-core` tiene que dar las mismas **claves** en todas las
plataformas; `protocol`, los mismos **bytes**. Un cambio incompatible aquí sube `ENVELOPE_VERSION`
y obliga a decidir qué pasa con los sobres en vuelo; un cambio en las claves ni siquiera es opción
sin migrar identidades ya emitidas.

`envelope.test.ts` incluye un **vector congelado**: un sobre sellado por la implementación anterior
(la que vivía en `apps/web/lib/crypto`, con Web Crypto y `btoa`) que este paquete tiene que seguir
abriendo. Es la prueba de regresión del formato, y el vector que el móvil tendrá que satisfacer.

## Modelo de amenaza relevante

Debe minimizar la metadata en claro del sobre. El relay ve `version`, `ephPub` y `nonce`; el tipo
de mensaje, la marca de tiempo y **la identidad del remitente** van cifrados dentro. Cada campo
nuevo fuera del ciphertext es una posible fuga: se justifica siguiendo `docs/PLANTILLA.md §4`.

## Dependencias externas

`@aegis/crypto-core` y `@noble/curves` (para el par X25519 efímero de cada sobre).

## Pendiente de revisión humana (`docs/PLANTILLA.md §5`)

`envelope.ts`. La mudanza no altera el formato — lo demuestra el vector congelado.
