/**
 * Sobre sealed-sender de un mensaje E2E (Modo A). Ata la cripto de contenido al acuerdo de clave
 * X25519 y a la identidad Ed25519, todo de `@aegis/crypto-core`.
 *
 * Modelo (ver docs/aegis-messaging-mvp.md §2-3):
 *  - El remitente genera un par X25519 EFÍMERO por mensaje; hace ECDH con la prekey X25519 del
 *    destinatario; deriva la clave AEAD por HKDF. La identidad real del remitente (Ed25519 + firma)
 *    viaja CIFRADA dentro del payload → el relay no la ve (sealed sender).
 *  - blob (opaco para el relay) = version(1) ‖ ephPub(32) ‖ nonce(24) ‖ ciphertext.
 *  - El destinatario descifra con su clave X25519 (de su semilla) y VERIFICA la firma del remitente.
 *
 * Este fichero es el CONTRATO DE CABLE, y por eso vive en su propio paquete: el móvil tiene que
 * producir y consumir exactamente estos bytes para que una conversación siga funcionando cuando
 * alguien cambia de dispositivo. Cualquier cambio aquí es un cambio de `ENVELOPE_VERSION`.
 *
 * ⚠️ Código criptográfico — pendiente de REVISIÓN HUMANA (docs/PLANTILLA.md §5).
 */
import { x25519 } from "@noble/curves/ed25519";
import {
  AEAD_NONCE_BYTES,
  aeadDecrypt,
  aeadEncrypt,
  concatBytes,
  cryptoError,
  deriveAeadKey,
  fromBase64Url,
  fromUtf8,
  prekeyMessage,
  publicKeyFromSeed,
  randomNonce,
  sharedSecretWith,
  signWithSeed,
  toBase64Url,
  utf8,
  verifyWithPublicKey,
  x25519PublicFromSeed,
} from "@aegis/crypto-core";

export const ENVELOPE_VERSION = 1;
const EPH_PUB_BYTES = 32;
const POLY1305_TAG_BYTES = 16;
const HEADER_BYTES = 1 + EPH_PUB_BYTES + AEAD_NONCE_BYTES; // version ‖ ephPub ‖ nonce

/** Separación de dominio de la clave de mensaje (no reutilizar con otros usos del ECDH). */
const MSG_INFO = utf8("aegis-msg:v1");

export type MessageKind = "text" | "file" | "audio";

export interface OutgoingMessage {
  kind: MessageKind;
  body: string; // texto en el MVP; metadatos de blob para archivos/audio (fase posterior)
}

export interface IncomingMessage {
  senderPub: string; // Ed25519 del remitente (base64url), ya verificada
  kind: MessageKind;
  sentAt: string; // ISO-8601
  body: string;
}

interface InnerEnvelope {
  v: number;
  kind: MessageKind;
  sentAt: string;
  senderPub: string; // base64url
  body: string;
  sig: string; // base64url, Ed25519 sobre el mensaje de autenticación
}

/**
 * Verifica que la prekey X25519 de un peer está FIRMADA por su identidad Ed25519 (anti-MITM:
 * impide que el relay cuele una prekey suya). Llamar SIEMPRE antes de cifrar hacia ese peer.
 */
export function verifyPeerPrekey(
  peerEd25519Pub: Uint8Array,
  x25519PublicKey: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  return verifyWithPublicKey(peerEd25519Pub, prekeyMessage(x25519PublicKey), signature);
}

/**
 * Mensaje canónico que el remitente FIRMA (dentro del sobre) para autenticar el contenido y
 * atarlo a este destinatario y a esta clave efímera (evita reenvío a otro destinatario).
 */
function senderAuthMessage(
  recipientEd25519Pub: Uint8Array,
  ephPub: Uint8Array,
  kind: MessageKind,
  sentAt: string,
  body: string,
): Uint8Array {
  return utf8(
    `aegis-msg-auth:v1:${toBase64Url(recipientEd25519Pub)}:${toBase64Url(ephPub)}:${kind}:${sentAt}:${body}`,
  );
}

/** Sella un mensaje para el destinatario. Devuelve el blob opaco a enviar por el relay. */
export async function sealEnvelope(params: {
  senderSeed: Uint8Array;
  recipientEd25519Pub: Uint8Array; // identidad del destinatario (para atar la firma)
  recipientX25519Pub: Uint8Array; // prekey X25519 del destinatario (ya VERIFICADA)
  message: OutgoingMessage;
}): Promise<Uint8Array> {
  const { senderSeed, recipientEd25519Pub, recipientX25519Pub, message } = params;

  // 1) Par efímero + ECDH con la prekey del destinatario → clave AEAD.
  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipientX25519Pub);
  const key = deriveAeadKey(shared, concatBytes(ephPub, recipientX25519Pub), MSG_INFO);

  // 2) Payload interno: identidad del remitente + firma que autentica el contenido.
  const sentAt = new Date().toISOString();
  const senderPub = await publicKeyFromSeed(senderSeed);
  const sig = await signWithSeed(
    senderSeed,
    senderAuthMessage(recipientEd25519Pub, ephPub, message.kind, sentAt, message.body),
  );
  const inner: InnerEnvelope = {
    v: ENVELOPE_VERSION,
    kind: message.kind,
    sentAt,
    senderPub: toBase64Url(senderPub),
    body: message.body,
    sig: toBase64Url(sig),
  };
  const innerBytes = utf8(JSON.stringify(inner));

  // 3) Cifrar. AAD = version ‖ ephPub (autenticadas, no cifradas).
  const nonce = randomNonce();
  const version = Uint8Array.of(ENVELOPE_VERSION);
  const aad = concatBytes(version, ephPub);
  const ciphertext = aeadEncrypt(key, nonce, innerBytes, aad);

  return concatBytes(version, ephPub, nonce, ciphertext);
}

/** Abre un blob recibido: descifra, VERIFICA la firma del remitente y devuelve el mensaje. */
export async function openEnvelope(params: {
  recipientSeed: Uint8Array;
  recipientEd25519Pub: Uint8Array; // la propia identidad del destinatario
  blob: Uint8Array;
}): Promise<IncomingMessage> {
  const { recipientSeed, recipientEd25519Pub, blob } = params;

  if (blob.length < HEADER_BYTES + POLY1305_TAG_BYTES) {
    throw cryptoError("envelopeTooShort");
  }
  const version = blob[0]!;
  if (version !== ENVELOPE_VERSION) {
    throw cryptoError("unsupportedEnvelopeVersion", { version });
  }
  const ephPub = blob.slice(1, 1 + EPH_PUB_BYTES);
  const nonce = blob.slice(1 + EPH_PUB_BYTES, HEADER_BYTES);
  const ciphertext = blob.slice(HEADER_BYTES);

  // 1) ECDH con nuestra clave X25519 (de la semilla) ↔ efímera del remitente → misma clave AEAD.
  const shared = sharedSecretWith(recipientSeed, ephPub);
  const ownX25519Pub = x25519PublicFromSeed(recipientSeed);
  const key = deriveAeadKey(shared, concatBytes(ephPub, ownX25519Pub), MSG_INFO);

  // 2) Descifrar (lanza si la etiqueta/AAD no cuadran).
  const aad = concatBytes(Uint8Array.of(version), ephPub);
  const innerBytes = aeadDecrypt(key, nonce, ciphertext, aad);
  const inner = JSON.parse(fromUtf8(innerBytes)) as InnerEnvelope;

  if (inner.kind !== "text" && inner.kind !== "file" && inner.kind !== "audio") {
    throw cryptoError("unknownMessageKind");
  }

  // 3) Verificar la firma del remitente sobre el mensaje canónico (autenticación + anti-reenvío).
  const senderPub = fromBase64Url(inner.senderPub);
  const sig = fromBase64Url(inner.sig);
  const ok = await verifyWithPublicKey(
    senderPub,
    senderAuthMessage(recipientEd25519Pub, ephPub, inner.kind, inner.sentAt, inner.body),
    sig,
  );
  if (!ok) throw cryptoError("invalidSenderSignature");

  return { senderPub: inner.senderPub, kind: inner.kind, sentAt: inner.sentAt, body: inner.body };
}
