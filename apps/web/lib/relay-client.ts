/**
 * Cliente HTTP del relay para el handshake de autenticación (Auth / AuthSession).
 *
 * El cliente habla con el relay como `/api` RELATIVO, bajo el MISMO origen que la web
 * (same-origin, sin CORS). En el nodo, Caddy sirve la web y enruta /api al relay por la
 * puerta por la que entraste (clearnet o .onion): el TRANSPORTE SIGUE LA PUERTA, sin que el
 * usuario elija nada. En dev (`next dev`), next.config reescribe /api/* → el relay local.
 *
 * No depende de IndexedDB (la firma se inyecta), así que es testeable en Node: define
 * NEXT_PUBLIC_API_BASE con una URL absoluta para apuntar a un relay real en los tests.
 */
import { fromBase64Url, toBase64Url } from "./crypto/ed25519";
import { dict } from "./i18n/runtime";

// Base de la API. Relativa por defecto (mismo origen); override absoluto para tests en Node.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "/api").replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Dirección .onion de la WEB (para invitar a cambiar de puerta desde clearnet), o "" si no se conoce. */
export const WEB_ONION_URL = (process.env.NEXT_PUBLIC_WEB_ONION_URL ?? "").trim().replace(/\/$/, "");

export type RelayGatewayKind = "onion" | "clearnet";

export interface RelayGateway {
  /** Tipo de puerta por la que se sirve la app AHORA (según window.location). */
  kind: RelayGatewayKind;
  /** Host de la puerta (window.location.host), o "" en SSR. */
  host: string;
}

/** Puerta (transporte) por la que se está sirviendo la app ahora mismo. Client-side. */
export function currentGateway(): RelayGateway {
  const host = typeof window !== "undefined" ? window.location.host : "";
  return { kind: /\.onion(?::\d+)?$/i.test(host) ? "onion" : "clearnet", host };
}

/** true si la web se sirve por la puerta .onion (transporte Tor). */
export function isOnionSession(): boolean {
  return currentGateway().kind === "onion";
}

/**
 * Aviso contextual sobre la puerta actual, para mostrar en login/ajustes. En clearnet invita a
 * usar la .onion (si se conoce) para anonimato o ante censura; en .onion confirma el modo protegido.
 */
export function gatewayNotice(): { onion: boolean; text: string } {
  const t = dict().errors;
  if (isOnionSession()) {
    return { onion: true, text: t.gatewayOnion };
  }
  return {
    onion: false,
    text: WEB_ONION_URL ? t.gatewayClearnetWithOnion : t.gatewayClearnet,
  };
}

export class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

/** Mensaje accionable cuando `fetch` al relay lanza (no responde), según la puerta actual. */
function relayUnreachableMessage(): string {
  const t = dict().errors;
  return isOnionSession() ? t.relayUnreachableOnion : t.relayUnreachableClearnet;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RelayError(relayUnreachableMessage(), 0);
  }
  if (res.status === 204) return undefined as T;
  const data = res.ok ? await res.json() : await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RelayError(
      (data as { error?: string }).error ?? dict().errors.genericStatus(res.status),
      res.status,
      (data as { error?: string }).error,
    );
  }
  return data as T;
}

function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>("POST", path, body, token);
}

export interface HealthResult {
  status: string; // "ok"
  db: string; // "up" | "down"
}

/**
 * Sondea `/health` del relay por la puerta actual (same-origin /api).
 * Lanza `RelayError` con status 0 si no se puede contactar (relay caído, o circuito .onion
 * aún no abierto — el caller distingue por `currentGateway().kind`).
 */
export async function fetchHealth(): Promise<HealthResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/health"), { method: "GET" });
  } catch {
    throw new RelayError(relayUnreachableMessage(), 0);
  }
  if (!res.ok) throw new RelayError(dict().errors.serverStatus(res.status), res.status);
  return res.json() as Promise<HealthResult>;
}

export interface ChallengeResponse {
  challengeId: string;
  nonce: string;
  message: string; // base64url del mensaje a firmar (dominio || nonce)
  expiresAt: string;
}

export interface VerifiedSession {
  token: string;
  expiresAt: string;
  identity: { publicKey: string; fingerprint: string };
}

/** Firma que produce una firma Ed25519 (64 bytes) sobre un mensaje. */
export type Signer = (message: Uint8Array) => Promise<Uint8Array>;

/** Ejecuta el handshake completo y devuelve la sesión (token) emitida por el relay. */
export async function authenticate(publicKeyB64: string, sign: Signer): Promise<VerifiedSession> {
  const challenge = await post<ChallengeResponse>("/auth/challenge", {
    publicKey: publicKeyB64,
  });
  const signature = await sign(fromBase64Url(challenge.message));
  return post<VerifiedSession>("/auth/verify", {
    challengeId: challenge.challengeId,
    signature: toBase64Url(signature),
  });
}

export interface MeResponse {
  publicKey: string;
  fingerprint: string;
  sessionId: string;
  username: string | null;
  hasPrekey: boolean;
}

export function fetchMe(token: string): Promise<MeResponse> {
  return request<MeResponse>("GET", "/auth/me", undefined, token);
}

export function logout(token: string): Promise<void> {
  return post<void>("/auth/logout", {}, token);
}

// --- Directorio de usuarios y prekeys X25519 -----------------------------------------

/** Key bundle de un usuario: prekey X25519 firmada con su Ed25519 (o null si no publicó). */
export interface KeyBundle {
  x25519PublicKey: string; // base64url
  x25519Signature: string; // base64url
  updatedAt: string;
}

/** Entrada del directorio: identidad + su key bundle para poder conectar. */
export interface DirectoryEntry {
  publicKey: string; // Ed25519 (base64url)
  fingerprint: string;
  username: string | null;
  keyBundle: KeyBundle | null;
}

/** Reclama o cambia el handle público con el que otros te encuentran. */
export function claimUsername(token: string, username: string): Promise<{ username: string }> {
  return request("PUT", "/directory/username", { username }, token);
}

/** Publica (o rota) la prekey X25519 firmada de esta identidad. */
export function publishPrekey(
  token: string,
  prekey: { x25519PublicKey: string; signature: string },
): Promise<{ ok: true }> {
  return request("PUT", "/directory/prekey", prekey, token);
}

/** Busca a un usuario por su handle → identidad + key bundle. */
export function resolveUsername(token: string, username: string): Promise<DirectoryEntry> {
  return request("GET", `/directory/resolve/${encodeURIComponent(username)}`, undefined, token);
}

/** Descarga el key bundle de una identidad por su clave pública (p. ej. tras un QR). */
export function fetchBundle(token: string, publicKeyB64: string): Promise<DirectoryEntry> {
  return request("GET", `/directory/bundle/${encodeURIComponent(publicKeyB64)}`, undefined, token);
}

// --- Buzón de mensajes (sealed sender, Modo A) ---------------------------------------
//
// La web habla siempre por `/api` same-origin: el TRANSPORTE SIGUE LA PUERTA (clearnet o
// .onion) sin que el usuario elija. El sobre `blob` es OPACO para el relay (contenido +
// identidad del remitente cifrados dentro, ver lib/crypto/messaging.ts): aquí solo se mueve
// base64url. El buzón se identifica por la clave pública Ed25519 del destinatario.

/** Sobre almacenado tal como lo devuelve el buzón del propio destinatario. */
export interface StoredEnvelope {
  id: string; // uuid del sobre en el buzón (para DELETE/ack)
  blob: string; // base64url del sobre opaco
  createdAt: string; // ISO-8601 (cursor incremental)
}

/**
 * Deja un sobre en el buzón de `recipientPubB64` (Ed25519, base64url). El remitente va
 * autenticado por la sesión (anti-spam) pero NO se almacena junto al sobre (sealed sender):
 * su identidad viaja cifrada dentro de `blob`.
 */
export function sendMessage(
  token: string,
  recipientPubB64: string,
  blob: Uint8Array,
): Promise<{ ok: true }> {
  return request(
    "POST",
    `/messages/${encodeURIComponent(recipientPubB64)}`,
    { blob: toBase64Url(blob) },
    token,
  );
}

/**
 * Recupera los sobres del propio buzón. `after` = cursor incremental (ISO): solo devuelve
 * los sobres con `createdAt > after`; omítelo para leer desde el principio (dentro del TTL).
 * NO borra al leer: los sobres se retienen bajo TTL para poder retomar la conversación al
 * cambiar de puerta (clearnet ↔ .onion) o de dispositivo.
 */
export async function fetchMessages(token: string, after?: string): Promise<StoredEnvelope[]> {
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";
  const { messages } = await request<{ messages: StoredEnvelope[] }>(
    "GET",
    `/messages${qs}`,
    undefined,
    token,
  );
  return messages;
}

/** Purga un sobre del propio buzón por su id (ack/borrado explícito por el destinatario). */
export function deleteMessage(token: string, id: string): Promise<void> {
  return request<void>("DELETE", `/messages/${encodeURIComponent(id)}`, undefined, token);
}

/**
 * Abre el stream SSE del buzón (`GET /messages/stream`) para recibir avisos de sobre nuevo en
 * TIEMPO REAL, y así no depender solo del sondeo. `onPoke` se llama por cada aviso; `onConnected`
 * refleja si el canal está vivo. Devuelve una función de cierre.
 *
 * Usa `fetch` con streaming (no `EventSource`) por un motivo concreto: EventSource no puede mandar
 * la cabecera `Authorization`, y aquí el token es bearer en memoria (no cookie). Con fetch sí. El
 * lector reconecta solo con backoff exponencial; el aviso solo es un "poke" (no trae el sobre), el
 * consumidor reacciona pidiendo /messages por cursor. Solo cliente (usa fetch streaming del navegador).
 */
export function openMessageStream(
  token: string,
  onPoke: () => void,
  onConnected?: (connected: boolean) => void,
): () => void {
  let closed = false;
  let controller: AbortController | null = null;
  let attempt = 0;

  async function connect(): Promise<void> {
    if (closed) return;
    controller = new AbortController();
    try {
      const res = await fetch(apiUrl("/messages/stream"), {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      onConnected?.(true);
      attempt = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Los frames SSE se separan por una línea en blanco. Un frame con `event: message` (o una
        // línea `data:`) es un aviso; los comentarios de latido (`: ping`) se ignoran.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (/^(event:\s*message|data:)/m.test(frame)) onPoke();
        }
      }
    } catch {
      /* corte de red / sesión / Tor: reconectamos abajo con backoff */
    } finally {
      onConnected?.(false);
      if (!closed) {
        attempt = Math.min(attempt + 1, 6);
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        setTimeout(() => void connect(), delay);
      }
    }
  }

  void connect();
  return () => {
    closed = true;
    controller?.abort();
  };
}

// --- Media (adjuntos cifrados: audio/archivos) ---------------------------------------
//
// El contenido va cifrado E2E (AEAD por chunks) ANTES de subirse; para el relay/bucket es un
// blob binario opaco. El relay hace de proxy al bucket S3 (el cliente nunca habla con B2): así,
// por .onion, el tráfico de adjuntos sigue yendo por la puerta y no filtra metadatos a un tercero.
// Se mueve como `application/octet-stream` (no base64) para no inflar un 33% adjuntos grandes.

/** Bytes → texto corto para mensajes de usuario ("1,5 GB" en es, "1.5 GB" en en / 240 MB). */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024)
      .toFixed(mb % 1024 === 0 ? 0 : 1)
      .replace(".", dict().quota.decimalSeparator)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/** "2026-09-12" → "el 12 de septiembre" / "on 12 September". null si no se puede parsear. */
function formatDay(iso: string): string | null {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const q = dict().quota;
  const month = q.months[date.getUTCMonth()];
  if (!month) return null;
  return q.day(date.getUTCDate(), month);
}

interface RelayErrorBody {
  error?: string;
  quota?: number;
  used?: number;
  freesAt?: string | null;
  freesBytes?: number;
  dailyLimit?: number;
  dailyUsed?: number;
}

/**
 * Traduce el código de error del relay a algo que un humano pueda leer.
 *
 * Regla de producto (docs/aegis-cuotas-almacenamiento.md §2 y §8): al topar la cuota, lo PRIMERO
 * que hay que decir es que la mensajería no está rota — el límite solo afecta a los adjuntos — y
 * lo segundo, la salida gratuita con fecha. Nunca se amenaza con borrar la cuenta.
 */
function humanRelayError(status: number, data: RelayErrorBody): string | null {
  const t = dict();
  switch (data.error) {
    case "quota_exceeded": {
      const cap = typeof data.quota === "number" ? ` (${formatBytes(data.quota)})` : "";
      const base = t.quota.exceeded(cap);
      const day = data.freesAt ? formatDay(data.freesAt) : null;
      if (day && typeof data.freesBytes === "number" && data.freesBytes > 0) {
        return t.quota.recovers(base, formatBytes(data.freesBytes), day);
      }
      return t.quota.recoversGeneric(base);
    }
    case "daily_limit": {
      const cap =
        typeof data.dailyLimit === "number"
          ? t.quota.dailyCapToday(formatBytes(data.dailyLimit))
          : t.quota.dailyCapTodayPlain;
      return t.quota.dailyLimit(cap);
    }
    case "media_too_large":
      return t.errors.mediaTooLarge;
    case "media_unconfigured":
      return t.errors.mediaUnconfigured;
    case "storage_upload_failed":
    case "storage_download_failed":
      return t.errors.storageUnavailable;
    default:
      return status === 429 ? t.errors.rateLimited : null;
  }
}

/** Lee el error `{error}` de una respuesta no-2xx (o un genérico) y lo lanza como RelayError. */
async function throwRelay(res: Response): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as RelayErrorBody;
  const message = humanRelayError(res.status, data) ?? data.error ?? `Error ${res.status}`;
  throw new RelayError(message, res.status, data.error);
}

/** Sube un ciphertext de media al relay (proxy a B2). Devuelve la `key` (uuid) para referenciarlo. */
export async function uploadMedia(token: string, ciphertext: Uint8Array): Promise<string> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/media"), {
      method: "POST",
      headers: { "content-type": "application/octet-stream", authorization: `Bearer ${token}` },
      body: ciphertext as unknown as BodyInit,
    });
  } catch {
    throw new RelayError(relayUnreachableMessage(), 0);
  }
  if (!res.ok) await throwRelay(res);
  const { key } = (await res.json()) as { key: string };
  return key;
}

/** Descarga un ciphertext de media por su `key`. Devuelve los bytes (aún cifrados). */
export async function downloadMedia(token: string, key: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(apiUrl(`/media/${encodeURIComponent(key)}`), {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    throw new RelayError(relayUnreachableMessage(), 0);
  }
  if (!res.ok) await throwRelay(res);
  return new Uint8Array(await res.arrayBuffer());
}

// --- Bloqueos -------------------------------------------------------------------------
//
// Un bloqueo es direccional y lo IMPONE el relay: si has bloqueado a alguien, sus sobres se
// descartan en el envío (silenciosamente, sin revelarle el bloqueo). El bloqueo va por
// identidad → vale igual por clearnet y por .onion.

/** Una entrada de la lista de bloqueados. */
export interface BlockedEntry {
  publicKey: string; // Ed25519 (base64url) del bloqueado
  createdAt: string; // ISO-8601
}

/** Bloquea a una identidad por su clave pública Ed25519 (base64url). */
export function blockUser(token: string, publicKeyB64: string): Promise<{ ok: true }> {
  return request("PUT", `/blocks/${encodeURIComponent(publicKeyB64)}`, undefined, token);
}

/** Desbloquea a una identidad. Idempotente. */
export function unblockUser(token: string, publicKeyB64: string): Promise<{ ok: true }> {
  return request("DELETE", `/blocks/${encodeURIComponent(publicKeyB64)}`, undefined, token);
}

/** Lista de bloqueados de la propia identidad, del más reciente al más antiguo. */
export async function listBlocks(token: string): Promise<BlockedEntry[]> {
  const { blocks } = await request<{ blocks: BlockedEntry[] }>("GET", "/blocks", undefined, token);
  return blocks;
}
