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
  if (isOnionSession()) {
    return {
      onion: true,
      text: "Estás en la puerta protegida .onion: el tráfico va por Tor y tu IP no es visible para el relay.",
    };
  }
  return {
    onion: false,
    text: WEB_ONION_URL
      ? "Estás en la puerta normal (clearnet). Si hay censura o quieres anonimato, abre nuestra .onion en el Navegador Tor."
      : "Estás en la puerta normal (clearnet). Tu IP es visible para el relay.",
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
  return isOnionSession()
    ? "No se pudo contactar con el relay por Tor. El circuito .onion puede tardar unos segundos en abrir; reintenta. Un bloqueador del navegador también puede estar cortando la petición."
    : "No se pudo contactar con el relay. Comprueba tu conexión y que ningún bloqueador del navegador corta la petición.";
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
      (data as { error?: string }).error ?? `Error ${res.status}`,
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
  if (!res.ok) throw new RelayError(`El relay respondió ${res.status}.`, res.status);
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
