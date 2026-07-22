# Aegis — Diseño del MVP de mensajería (Fase 1, Modo A)

> Estado: **diseño para implementación**. El código criptográfico derivado de este doc
> requiere **revisión humana** antes de confiarse (`PLANTILLA.md §5`). Ancla en
> `ARQUITECTURA.md §2-4`. Reutiliza la cripto ya existente en `apps/web/lib/crypto/`.

## 0. Alcance del MVP

Primera rebanada: **enviar y recibir un mensaje de TEXTO cifrado E2E** entre dos identidades
por el relay (Modo A), persistido y recuperable por cualquier puerta (clearnet / `.onion`).
Después, sobre el mismo formato: **archivos** y **audio** (chunking). Sin P2P/mesh (Fases 3+).

## 1. Decisiones (tomadas)

1. **Librería de cifrado de contenido: `@noble/ciphers` (XChaCha20-Poly1305).** Coherente con el
   resto (`@noble/*` ya en uso); sin WASM. **Desviación consciente** respecto a `ARQUITECTURA.md §3`,
   que menciona `crypto_secretstream` (exclusivo de libsodium): para TEXTO basta AEAD por mensaje;
   para streaming (audio/archivos) se implementará un **AEAD por chunks** equivalente sobre `@noble`
   (nonce con contador + flag de fin, detección de reordenamiento/truncado), sin introducir libsodium.
   Si la revisión exige `secretstream` estricto, se reevalúa añadir `libsodium-wrappers` solo para eso.
2. **Acuerdo de clave: X25519 ECDH efímero-a-prekey (sealed sender).** El remitente genera un par
   X25519 **efímero** por mensaje; hace ECDH con la **prekey X25519 firmada** del destinatario (del
   directorio); deriva la clave AEAD por **HKDF-SHA256**. La identidad real del remitente (Ed25519 +
   firma) viaja **dentro** del payload cifrado → el relay no la ve (sealed sender).
3. **Autenticación del remitente:** dentro del texto cifrado va la Ed25519 pública del remitente y una
   **firma** sobre el contenido; el destinatario la verifica y la contrasta con su lista de contactos.
4. **Verificación de prekey en cliente (anti-MITM):** antes de cifrar, el cliente **verifica la firma
   Ed25519** de la prekey X25519 del destinatario (hoy solo se verifica en el relay). Requiere exponer
   `verifySignature` en `ed25519.ts` (hoy solo hay `sign`).
5. **Persistencia (requisito "retomar conversación por cualquier puerta"):** el historial vive en el
   **relay**, como blobs cifrados por destinatario. NO se borra al entregar (desviación consciente del
   §3.5 "borrar tras entrega"): se retiene bajo **TTL** (p. ej. 30 días) para que, entrando por clearnet
   o `.onion` con la misma identidad, se recupere la misma conversación. El cliente cachea local por
   origen, pero la **fuente de verdad es el relay**.
6. **Post autenticado (anti-spam):** enviar un blob requiere sesión válida (rate-limit), pero el blob
   **NO almacena la identidad del remitente**. Limitación honesta: el relay podría correlacionar
   remitente↔destinatario en el momento del POST (mitigado por la `.onion` que oculta IP; los **tokens
   ciegos** para post no vinculable son endurecimiento v2).

## 2. Formato de sobre (wire)

Lo que el relay ve y almacena por mensaje es **mínimo**: destinatario (para enrutar) + blob opaco.

```
POST /api/messages           (autenticado)
  body: { recipient: <Ed25519 pub b64url>, blob: <b64url> }

blob (binario, opaco para el relay) =
  [ version:1B = 0x01 ]
  [ ephPub:32B ]            # X25519 pública efímera del remitente
  [ nonce:24B ]            # XChaCha20-Poly1305
  [ ciphertext:variable ]  # AEAD(clave, nonce, innerPlaintext, aad=version‖ephPub)
```

`innerPlaintext` (tras descifrar, JSON UTF-8 en el MVP; se puede binarizar luego):

```json
{
  "v": 1,
  "kind": "text",                 // "text" | "file" | "audio"
  "sentAt": "<ISO-8601>",
  "senderPub": "<Ed25519 pub b64url>",
  "body": "<texto | metadatos de blob>",
  "sig": "<Ed25519 sig b64url>"    // firma sobre canonical(recipientPub‖ephPub‖kind‖sentAt‖body)
}
```

- El relay solo ve `recipient` + `blob` (versión, ephPub, nonce, ciphertext). **Ni remitente ni
  contenido.** `kind`, `sentAt`, `senderPub`, `body`, `sig` van cifrados.

## 3. Flujo E2E (texto)

**Enviar (S → R):**
1. `bundle = fetchBundle/resolveUsername(R)` → Ed25519 de R + prekey X25519 firmada.
2. **Verificar** la firma de la prekey con la Ed25519 de R (anti-MITM). Si falla → abortar.
3. Generar par X25519 efímero `E`. `shared = ECDH(E_priv, R_prekey_pub)`.
4. `key = HKDF-SHA256(shared, info="aegis-msg:v1", salt=ephPub‖R_prekey_pub)`.
5. Construir `innerPlaintext` (con `senderPub` y `sig` del remitente).
6. `ct = XChaCha20Poly1305(key, nonce).encrypt(inner, aad=version‖ephPub)`.
7. `blob = 0x01 ‖ ephPub ‖ nonce ‖ ct`. `POST /api/messages { recipient=R_ed, blob }`.

**Recibir (R):**
1. `GET /api/messages` (autenticado como R) → lista de `{ id, blob, createdAt }`.
2. Por cada blob: parsear `ephPub, nonce, ct`. `shared = ECDH(R_prekey_priv, ephPub)`.
3. `key = HKDF-SHA256(...)` (mismo). `inner = decrypt(key, nonce, ct, aad)`.
4. Verificar `sig` con `inner.senderPub`. Contrastar `senderPub` con contactos conocidos.
5. Mostrar/almacenar. `ack`/`DELETE` opcional; el relay retiene bajo TTL (persistencia cross-puerta).

## 4. Relay — buzón (Modo A)

- **Tabla `messages`** (migración): `id` (uuid), `recipient` (Ed25519 pub, indexado), `blob` (bytea),
  `created_at`, `expires_at` (TTL), `delivered_at` (nullable). Sin columna de remitente.
- **`POST /api/messages`** (requiere sesión): valida tamaños, inserta blob para `recipient`. Encola en
  BullMQ/Dragonfly una notificación de entrega (para el long-poll/online).
- **`GET /api/messages`** (requiere sesión): devuelve blobs pendientes/recientes del `recipient` =
  identidad de la sesión. Marca `delivered_at`. Retiene bajo TTL (no borra al entregar).
- **`DELETE /api/messages` / ack** (opcional): el destinatario puede purgar.
- **TTL**: barrido de `expires_at` (job periódico) — reutiliza el patrón de mantenimiento del relay.

## 5. Reparto en el código

| Pieza | Dónde | Nota |
|---|---|---|
| AEAD XChaCha20-Poly1305 + HKDF | `apps/web/lib/crypto/aead.ts` (nuevo) | `@noble/ciphers` + `@noble/hashes` |
| `verifySignature` Ed25519 | `apps/web/lib/crypto/ed25519.ts` | hoy solo `sign` |
| Sellar/abrir sobre + verificar prekey | `apps/web/lib/crypto/messaging.ts` (nuevo) | reusa `x25519.ts`/`ed25519.ts` |
| Formato de sobre (constantes/pack) | `packages/protocol` | tipos compartidos (web+móvil) |
| Cliente HTTP de mensajes | `apps/web/lib/relay-client.ts` | `sendMessage`/`fetchMessages` |
| Buzón (migración + rutas + cola) | `apps/relay/src/messages/` | patrón de `auth`/`directory` |
| Interfaz de transporte | `packages/transport` | `send/receive/onMessage` sobre `/api` |

> **Consolidación pendiente (track móvil):** a medio plazo, la cripto de `apps/web/lib/crypto` debería
> subirse a `packages/crypto-core` para reutilizarla en `apps/mobile`. Ahora se implementa donde ya
> vive la cripto real, para no bloquear la Fase 1. Documentado como deuda técnica consciente.

## 6. Límites honestos (para el modelo de amenaza)

- **Forward secrecy parcial:** efímero en el remitente, pero prekey de largo plazo en el destinatario
  (rotable vía directorio). Un **double-ratchet** completo es post-MVP.
- **Sealed sender parcial:** post autenticado → el relay puede correlacionar en el momento del envío
  (mitiga la `.onion`). No vinculable = v2 (tokens ciegos).
- **Metadata:** tamaño/timing del blob observables por el relay (padding = v2, ver §8 de amenazas).
