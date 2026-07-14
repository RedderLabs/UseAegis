# @aegis/crypto-core

## Qué hace
Wrapper fino sobre libsodium con las primitivas de Aegis: Ed25519 (identidad),
X25519 (acuerdo de claves), XChaCha20-Poly1305 (payload), crypto_secretstream
(chunking) y Argon2id (KDF de passphrase local).

## Qué NO hace
No implementa criptografía propia. No decide transporte ni serialización. No
persiste claves — solo las produce y opera con ellas.

## Modelo de amenaza relevante
Protege la confidencialidad e integridad del contenido y la identidad del remitente
(sealed sender). No protege metadata de conexión ni el dispositivo comprometido
(ver `docs/THREAT_MODEL.md §3`).

## Dependencias externas
- `libsodium` (auditado). Cada uso referencia el primitivo en la doc oficial de libsodium.
