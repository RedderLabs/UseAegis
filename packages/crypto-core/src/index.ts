/**
 * @aegis/crypto-core
 *
 * Placeholder de la fase 1 del roadmap (docs/ARQUITECTURA.md §9).
 * Regla dura (docs/PLANTILLA.md §5): sin implementaciones propias de primitivos
 * criptográficos — siempre libsodium o equivalente auditado, con referencia a la
 * documentación oficial del primitivo.
 *
 * Primitivos previstos:
 *  - Ed25519  → identidad estable / firma
 *  - X25519   → acuerdo de claves (ECDH) por sesión
 *  - XChaCha20-Poly1305 → cifrado autenticado del payload
 *  - crypto_secretstream → chunking en streaming
 *  - Argon2id → derivación de clave desde passphrase local
 */

export const CRYPTO_CORE_READY = false;
