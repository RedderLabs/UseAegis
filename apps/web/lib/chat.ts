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
import { openMessageBlob, sealMessageFor } from "./crypto/identity-store";
import { fromBase64Url } from "./crypto/ed25519";
import { deleteMessage, fetchMessages, sendMessage } from "./relay-client";
import type { Contact } from "./contacts";

/** Un mensaje tal como lo muestra la UI del Canal. */
export interface ChatMessage {
  id: string; // id del sobre en el buzón (entrantes) o uuid local (salientes)
  dir: "in" | "out";
  body: string;
  sentAt: string; // ISO-8601 (del sobre para entrantes, del envío para salientes)
  peerPub: string; // Ed25519 del otro extremo (base64url): clave de la conversación
  pending?: boolean; // saliente aún sin confirmar por el relay
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

/** Sella un texto para el contacto y lo deja en su buzón. Devuelve el mensaje saliente. */
export async function sendText(
  token: string,
  contact: Contact,
  text: string,
): Promise<ChatMessage> {
  const blob = await sealMessageFor({
    recipientEd25519Pub: fromBase64Url(contact.pub),
    recipientX25519Pub: fromBase64Url(contact.x25519),
    message: { kind: "text", body: text },
  });
  await sendMessage(token, contact.pub, blob);
  return {
    id: crypto.randomUUID(),
    dir: "out",
    body: text,
    sentAt: new Date().toISOString(),
    peerPub: contact.pub,
  };
}

export interface InboxUpdate {
  /** Mensajes entrantes nuevos, ya abiertos y verificados, agrupados por remitente. */
  incoming: ChatMessage[];
  /** Nuevo cursor a persistir (el createdAt del último sobre leído), si avanzó. */
  cursor?: string;
}

/**
 * Sondea el propio buzón desde el cursor guardado. Abre cada sobre (los que no descifran o
 * no verifican se descartan silenciosamente y se marcan para purga). Avanza y guarda el
 * cursor. Devuelve solo los mensajes de texto entrantes nuevos.
 */
export async function pollInbox(token: string, ownPub: string): Promise<InboxUpdate> {
  const cursor = loadCursor(ownPub);
  const envelopes = await fetchMessages(token, cursor);
  if (envelopes.length === 0) return { incoming: [] };

  const incoming: ChatMessage[] = [];
  for (const env of envelopes) {
    try {
      const msg = await openMessageBlob(fromBase64Url(env.blob));
      if (msg.kind !== "text") continue; // archivos/audio: fase posterior
      incoming.push({
        id: env.id,
        dir: "in",
        body: msg.body,
        sentAt: msg.sentAt,
        peerPub: msg.senderPub,
      });
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
 */
export function mergeIncoming(ownPub: string, incoming: ChatMessage[]): Set<string> {
  const touched = new Set<string>();
  const byPeer = new Map<string, ChatMessage[]>();
  for (const m of incoming) {
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
