# @aegis/protocol

## Qué hace
Define la forma de un mensaje Aegis (tipo, versión de protocolo, serialización)
de manera idéntica para relay, P2P y mesh.

## Qué NO hace
No cifra (eso es `@aegis/crypto-core`) ni transporta (eso es `@aegis/transport`).
Solo describe y serializa la estructura.

## Modelo de amenaza relevante
Debe minimizar la metadata en claro del sobre (envelope). Cada campo nuevo es una
posible fuga: se justifica siguiendo el checklist de `docs/PLANTILLA.md §4`.

## Dependencias externas
Ninguna prevista de momento (serialización con utilidades estándar).
