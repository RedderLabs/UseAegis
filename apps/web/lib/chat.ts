/**
 * Servicio de chat de la Fase 1 (Modo A, texto E2E). Une tres piezas ya construidas:
 *   - cripto de sobre sealed-sender (lib/crypto/messaging.ts, vía identity-store)
 *   - buzón del relay same-origin (/api, lib/relay-client.ts)
 *   - contactos verificados locales (lib/contacts.ts)
 *
 * Enviar: sella el texto para el contacto y lo deja en SU buzón. Recibir: sondea el PROPIO
 * buzón por cursor incremental, abre cada sobre (verifica la firma del remitente) y clasifica
 * el mensaje en la conversación de ese remitente.
 *
 * NO se borra al leer: los sobres se retienen bajo TTL en el relay, así que al cambiar de
 * puerta (clearnet ↔ .onion) o de dispositivo se puede reconstruir lo recibido re-sondeando
 * desde el principio. El historial de lo ENVIADO se guarda localmente por conversación.
 */
import { openMessageBlob, sealForSelf, sealMessageFor } from "./crypto/identity-store";
import { fromBase64Url, toBase64Url } from "./crypto/ed25519";
import { decryptMedia, encryptMedia, randomMediaKey } from "./crypto/aead-stream";
import {
  deleteMessage,
  downloadMedia,
  fetchMessages,
  sendMessage,
  uploadMedia,
} from "./relay-client";
import type { Contact } from "./contacts";

/**
 * Descriptor de un adjunto cifrado (archivo/audio). Viaja DENTRO del sobre sealed-sender (E2E):
 * `key` es la clave AEAD del media, cifrada para el destinatario junto con el resto del sobre.
 * `mediaId` es la capability del objeto en el relay (GET /media/:mediaId). `size` = tamaño del
 * claro. El relay/bucket solo ven el ciphertext opaco; nunca el nombre, el tipo ni la clave.
 */
export interface FileAttachment {
  mediaId: string; // uuid del objeto en el relay/bucket
  key: string; // base64url de la clave AEAD de 32 B del adjunto
  name: string;
  mime: string;
  size: number; // bytes del claro
  durationMs?: number; // duración (solo notas de voz/audio); MediaRecorder no siempre la incrusta
}

/** Un mensaje tal como lo muestra la UI del Canal. */
export interface ChatMessage {
  id: string; // id del sobre en el buzón (entrantes) o uuid local (salientes)
  dir: "in" | "out";
  body: string; // texto; para adjuntos = nombre del archivo (previsualización)
  sentAt: string; // ISO-8601 (del sobre para entrantes, del envío para salientes)
  peerPub: string; // Ed25519 del otro extremo (base64url): clave de la conversación
  pending?: boolean; // saliente aún sin confirmar por el relay
  file?: FileAttachment; // presente si el mensaje es un adjunto (kind file/audio)
  kind?: "text" | "file" | "audio"; // por defecto text si ausente
}

/** Valida y parsea el descriptor de adjunto que viaja en el `body` cifrado de un sobre file/audio. */
function parseFileMeta(body: string): FileAttachment | null {
  try {
    const o = JSON.parse(body) as FileAttachment;
    if (
      o &&
      typeof o.mediaId === "string" &&
      typeof o.key === "string" &&
      typeof o.name === "string" &&
      typeof o.mime === "string" &&
      typeof o.size === "number"
    ) {
      return o;
    }
  } catch {
    /* cuerpo no reconocido */
  }
  return null;
}

// --- Self-copy de lo enviado (continuidad cross-puerta / multi-dispositivo) ------------
//
// Al enviar, además de dejar el sobre en el buzón del destinatario, se sella una COPIA para
// el propio buzón. Su cuerpo (cifrado, opaco para el relay) lleva el peer real y un id de
// mensaje estable. Al sondear el propio buzón, un sobre cuyo remitente somos nosotros es una
// self-copy → se reconstruye como mensaje SALIENTE en la conversación de `to`. Así, en una
// puerta o dispositivo nuevos, se recupera también lo enviado, no solo lo recibido.

const SELF_COPY_V = 1;

interface SelfCopyBody {
  v: typeof SELF_COPY_V;
  mid: string; // id estable del mensaje (dedup contra el optimista local)
  to: string; // Ed25519 (base64url) del destinatario real
  text?: string; // presente si es un mensaje de texto
  file?: FileAttachment; // presente si es un adjunto (archivo/audio)
}

function encodeSelfCopy(mid: string, to: string, text: string): string {
  return JSON.stringify({ v: SELF_COPY_V, mid, to, text } satisfies SelfCopyBody);
}

function encodeSelfCopyFile(mid: string, to: string, file: FileAttachment): string {
  return JSON.stringify({ v: SELF_COPY_V, mid, to, file } satisfies SelfCopyBody);
}

function decodeSelfCopy(body: string): SelfCopyBody | null {
  try {
    const o = JSON.parse(body) as SelfCopyBody;
    if (
      o?.v === SELF_COPY_V &&
      typeof o.mid === "string" &&
      typeof o.to === "string" &&
      (typeof o.text === "string" || parseFileMeta(JSON.stringify(o.file)) !== null)
    ) {
      return o;
    }
  } catch {
    /* cuerpo no reconocido */
  }
  return null;
}

// --- Persistencia local por conversación ----------------------------------------------

const HISTORY_PREFIX = "aegis.chat.v2"; // aegis.chat.v2.<ownPub>.<peerPub>
const CURSOR_PREFIX = "aegis.inbox.cursor"; // aegis.inbox.cursor.<ownPub>

function historyKey(ownPub: string, peerPub: string): string {
  return `${HISTORY_PREFIX}.${ownPub}.${peerPub}`;
}

/** Historial local de una conversación (mensajes enviados + recibidos ya vistos). */
export function loadHistory(ownPub: string, peerPub: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(ownPub, peerPub));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(ownPub: string, peerPub: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(historyKey(ownPub, peerPub), JSON.stringify(messages));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Borra el hilo local con un peer (p. ej. al bloquear). No toca el buzón del relay. */
export function clearConversation(ownPub: string, peerPub: string): void {
  try {
    localStorage.removeItem(historyKey(ownPub, peerPub));
  } catch {
    /* noop */
  }
  markRead(ownPub, peerPub); // deja de contar como no leído
}

/** Todos los peers con los que hay hilo local (contactos o no), leyendo las claves guardadas. */
export function conversationPeers(ownPub: string): string[] {
  const prefix = `${HISTORY_PREFIX}.${ownPub}.`;
  const peers: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) peers.push(key.slice(prefix.length));
    }
  } catch {
    /* noop */
  }
  return peers;
}

/** true si en el hilo con `peerPub` hay al menos un mensaje ENTRANTE (nos escribió). */
export function hasIncoming(ownPub: string, peerPub: string): boolean {
  return loadHistory(ownPub, peerPub).some((m) => m.dir === "in");
}

/** Último mensaje del hilo con `peerPub` (para previsualizar una solicitud), o undefined. */
export function lastMessage(ownPub: string, peerPub: string): ChatMessage | undefined {
  const h = loadHistory(ownPub, peerPub);
  return h[h.length - 1];
}

// --- No leídos (aviso de mensajes entrantes) ------------------------------------------
//
// Conjunto de peers con mensajes entrantes sin leer, por identidad. Al recibir un entrante de
// una conversación que NO está abierta se marca; al abrir esa conversación se limpia. Cualquier
// cambio dispara el evento `aegis:unread` para que el badge del menú (DashboardShell) se refresque.

const UNREAD_PREFIX = "aegis.unread"; // aegis.unread.<ownPub> = JSON string[] de peerPub

const UNREAD_EVENT = "aegis:unread";

function notifyUnread(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(UNREAD_EVENT));
}

/** Peers con al menos un mensaje entrante sin leer. */
export function unreadPeers(ownPub: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${UNREAD_PREFIX}.${ownPub}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Nº de conversaciones con no leídos. */
export function unreadCount(ownPub: string): number {
  return unreadPeers(ownPub).size;
}

function saveUnread(ownPub: string, set: Set<string>): void {
  try {
    localStorage.setItem(`${UNREAD_PREFIX}.${ownPub}`, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
  notifyUnread();
}

/** Marca la conversación con `peerPub` como con no leídos. */
export function markUnread(ownPub: string, peerPub: string): void {
  const s = unreadPeers(ownPub);
  if (s.has(peerPub)) return;
  s.add(peerPub);
  saveUnread(ownPub, s);
}

/** Marca la conversación con `peerPub` como leída (al abrirla o al bloquear/eliminar). */
export function markRead(ownPub: string, peerPub: string): void {
  const s = unreadPeers(ownPub);
  if (!s.delete(peerPub)) return;
  saveUnread(ownPub, s);
}

function loadCursor(ownPub: string): string | undefined {
  try {
    return localStorage.getItem(`${CURSOR_PREFIX}.${ownPub}`) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveCursor(ownPub: string, cursor: string): void {
  try {
    localStorage.setItem(`${CURSOR_PREFIX}.${ownPub}`, cursor);
  } catch {
    /* noop */
  }
}

// --- Operaciones de red ---------------------------------------------------------------

/**
 * Sella un texto para el contacto y lo deja en su buzón. Además deja una self-copy sellada en
 * el PROPIO buzón (`ownPub`) para reconstruir el lado saliente al cambiar de puerta/dispositivo.
 * Devuelve el mensaje saliente con `id` = `mid` (mismo id que llevará la self-copy → dedup).
 */
export async function sendText(
  token: string,
  ownPub: string,
  contact: Contact,
  text: string,
): Promise<ChatMessage> {
  const mid = crypto.randomUUID();
  const blob = await sealMessageFor({
    recipientEd25519Pub: fromBase64Url(contact.pub),
    recipientX25519Pub: fromBase64Url(contact.x25519),
    message: { kind: "text", body: text },
  });
  await sendMessage(token, contact.pub, blob);

  // Self-copy al propio buzón. Best-effort: si falla, el mensaje YA se entregó al destinatario;
  // solo se pierde la continuidad del lado saliente en otras puertas/dispositivos.
  try {
    const selfBlob = await sealForSelf({ kind: "text", body: encodeSelfCopy(mid, contact.pub, text) });
    await sendMessage(token, ownPub, selfBlob);
  } catch {
    /* la entrega principal ya ocurrió */
  }

  return {
    id: mid,
    dir: "out",
    body: text,
    sentAt: new Date().toISOString(),
    peerPub: contact.pub,
    kind: "text",
  };
}

/**
 * Cifra un adjunto (archivo/audio) con una clave aleatoria por adjunto, lo sube al relay (que hace
 * de proxy al bucket) y sella un sobre file/audio para el contacto con el descriptor (mediaId +
 * clave AEAD, ambos E2E). Deja además una self-copy en el propio buzón (continuidad cross-puerta).
 * El contenido NUNCA sale sin cifrar; el relay/bucket solo ven ciphertext opaco.
 */
export async function sendFile(
  token: string,
  ownPub: string,
  contact: Contact,
  file: File,
  kind: "file" | "audio" = "file",
  durationMs?: number,
): Promise<ChatMessage> {
  const mid = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaKey = randomMediaKey();
  const ciphertext = encryptMedia(mediaKey, bytes);
  const mediaId = await uploadMedia(token, ciphertext);
  const meta: FileAttachment = {
    mediaId,
    key: toBase64Url(mediaKey),
    name: file.name || (kind === "audio" ? "nota-de-voz" : "archivo"),
    mime: file.type || "application/octet-stream",
    size: bytes.length,
    ...(durationMs && durationMs > 0 ? { durationMs: Math.round(durationMs) } : {}),
  };

  const blob = await sealMessageFor({
    recipientEd25519Pub: fromBase64Url(contact.pub),
    recipientX25519Pub: fromBase64Url(contact.x25519),
    message: { kind, body: JSON.stringify(meta) },
  });
  await sendMessage(token, contact.pub, blob);

  // Self-copy al propio buzón (best-effort; el destinatario ya recibió el adjunto).
  try {
    const selfBlob = await sealForSelf({ kind, body: encodeSelfCopyFile(mid, contact.pub, meta) });
    await sendMessage(token, ownPub, selfBlob);
  } catch {
    /* la entrega principal ya ocurrió */
  }

  return {
    id: mid,
    dir: "out",
    body: meta.name,
    sentAt: new Date().toISOString(),
    peerPub: contact.pub,
    file: meta,
    kind,
  };
}

/**
 * Descarga y DESCIFRA un adjunto bajo demanda (al pulsar sobre él en el Canal). Devuelve un Blob
 * con el MIME original, listo para abrir/descargar o reproducir. Lanza si la descarga o la
 * verificación de integridad (AEAD por chunks) fallan.
 */
export async function downloadAttachment(token: string, file: FileAttachment): Promise<Blob> {
  const ciphertext = await downloadMedia(token, file.mediaId);
  const plain = decryptMedia(fromBase64Url(file.key), ciphertext);
  return new Blob([plain as unknown as BlobPart], {
    type: file.mime || "application/octet-stream",
  });
}

export interface InboxUpdate {
  /**
   * Mensajes nuevos de esta vuelta, ya abiertos y verificados: entrantes (`dir:"in"`) y
   * self-copies de lo propio enviado (`dir:"out"`), listos para integrar por conversación.
   */
  incoming: ChatMessage[];
  /** Nuevo cursor a persistir (el createdAt del último sobre leído), si avanzó. */
  cursor?: string;
}

/**
 * Sondea el propio buzón desde el cursor guardado. Abre cada sobre (los que no descifran o
 * no verifican se descartan silenciosamente y se marcan para purga). Un sobre cuyo remitente
 * somos nosotros es una self-copy → se reclasifica como mensaje SALIENTE. Avanza y guarda el
 * cursor. Devuelve los mensajes de texto nuevos (entrantes + salientes reconstruidos).
 */
export async function pollInbox(token: string, ownPub: string): Promise<InboxUpdate> {
  const cursor = loadCursor(ownPub);
  const envelopes = await fetchMessages(token, cursor);
  if (envelopes.length === 0) return { incoming: [] };

  const incoming: ChatMessage[] = [];
  for (const env of envelopes) {
    try {
      const msg = await openMessageBlob(fromBase64Url(env.blob));
      if (msg.senderPub === ownPub) {
        // Self-copy: mensaje que YO envié, replicado a mi buzón para continuidad saliente.
        const self = decodeSelfCopy(msg.body);
        if (!self) continue; // cuerpo no reconocido: ignorar (es nuestro, no purgar)
        if (self.file) {
          incoming.push({
            id: self.mid, dir: "out", body: self.file.name, sentAt: msg.sentAt,
            peerPub: self.to, file: self.file, kind: msg.kind === "audio" ? "audio" : "file",
          });
        } else if (typeof self.text === "string") {
          incoming.push({ id: self.mid, dir: "out", body: self.text, sentAt: msg.sentAt, peerPub: self.to, kind: "text" });
        }
      } else if (msg.kind === "file" || msg.kind === "audio") {
        const meta = parseFileMeta(msg.body);
        if (!meta) continue; // descriptor de adjunto ilegible: descartar
        incoming.push({
          id: env.id, dir: "in", body: meta.name, sentAt: msg.sentAt,
          peerPub: msg.senderPub, file: meta, kind: msg.kind,
        });
      } else {
        incoming.push({ id: env.id, dir: "in", body: msg.body, sentAt: msg.sentAt, peerPub: msg.senderPub, kind: "text" });
      }
    } catch {
      // Sobre corrupto o no dirigido a nosotros: purgar para no reintentar cada vuelta.
      void deleteMessage(token, env.id).catch(() => undefined);
    }
  }

  // El buzón devuelve en orden ascendente por createdAt → el último es el nuevo cursor.
  const newCursor = envelopes[envelopes.length - 1]!.createdAt;
  saveCursor(ownPub, newCursor);
  return { incoming, cursor: newCursor };
}

/**
 * Integra los entrantes de una vuelta de polling en la conversación de cada remitente,
 * evitando duplicados por id. Persiste cada conversación tocada. Devuelve el set de
 * `peerPub` afectados para que la UI refresque la conversación abierta si procede.
 *
 * `isBlocked` (opcional): los mensajes de un peer bloqueado se descartan aquí (no se guardan ni
 * reaparecen como solicitud). El relay ya frena los envíos POSTERIORES al bloqueo; esto cubre
 * los sobres que quedaran en el buzón de ANTES de bloquear.
 */
export function mergeIncoming(
  ownPub: string,
  incoming: ChatMessage[],
  isBlocked?: (peerPub: string) => boolean,
): Set<string> {
  const touched = new Set<string>();
  const byPeer = new Map<string, ChatMessage[]>();
  for (const m of incoming) {
    if (m.dir === "in" && isBlocked?.(m.peerPub)) continue; // entrante de bloqueado: descartar
    const arr = byPeer.get(m.peerPub) ?? [];
    arr.push(m);
    byPeer.set(m.peerPub, arr);
  }
  for (const [peerPub, msgs] of byPeer) {
    const history = loadHistory(ownPub, peerPub);
    const seen = new Set(history.map((h) => h.id));
    const fresh = msgs.filter((m) => !seen.has(m.id));
    if (fresh.length === 0) continue;
    const merged = [...history, ...fresh].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    saveHistory(ownPub, peerPub, merged);
    touched.add(peerPub);
  }
  return touched;
}
