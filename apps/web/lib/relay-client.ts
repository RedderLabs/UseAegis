/**
 * Cliente HTTP del relay para el handshake de autenticación (Auth / AuthSession).
 *
 * Reproduce el flujo de `apps/relay`: pide un challenge para la clave pública, firma
 * el mensaje con la semilla del dispositivo y canjea la firma por un token de sesión.
 * No depende de IndexedDB (la firma se inyecta), así que es testeable en Node.
 */
import { fromBase64Url, toBase64Url } from "./crypto/ed25519";

/** Normaliza una URL de env: garantiza esquema y quita la barra final. */
function normalizeUrl(raw: string, fallbackScheme: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  // La .onion suele configurarse sin esquema (xxxx.onion) — le añadimos http://.
  return /^https?:\/\//.test(trimmed) ? trimmed : `${fallbackScheme}${trimmed}`;
}

// Dos puertas al MISMO relay (mismo Fastify/Postgres, ver docs/aegis-node-proxmox-setup.md §6):
// clearnet por HTTPS y hidden service .onion por HTTP (el cifrado por capas de Tor basta).
const CLEARNET_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_RELAY_URL ?? "http://127.0.0.1:8443",
  "https://",
);
const ONION_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_RELAY_ONION_URL ?? "",
  "http://",
);

/**
 * Endpoint del relay según el modo de la sesión.
 *
 * `secure` (sesión protegida) → hidden service .onion; normal → clearnet.
 * Ojo: el navegador NO embebe Tor; apuntar el fetch a la .onion solo enruta de
 * verdad bajo Tor Browser o un proxy Tor del sistema. Si no hay .onion configurada
 * caemos a clearnet para no romper el login.
 */
export function relayBaseUrl(secure: boolean): string {
  return secure && ONION_URL ? ONION_URL : CLEARNET_URL;
}

/**
 * Aviso PREVENTIVO para mostrar al usuario cuando ACTIVA la sesión protegida (.onion) en la
 * web. El navegador no embebe Tor: apuntar el fetch a la .onion solo enruta de verdad bajo
 * Tor Browser o Brave con pestaña Tor. El modo con Tor embebido (Arti) llegará en la app
 * nativa, no en el navegador (ver docs/aegis-node-proxmox-setup.md §6). Copy compartido por
 * el switch de login y el de Ajustes para no divergir.
 */
export const TOR_SESSION_NOTICE =
  "Se enruta por el hidden service .onion (Tor). Ábrelo en el Navegador Tor o en Brave con una pestaña Tor: en un navegador normal la sesión protegida no podrá conectar.";

/**
 * Mensaje accionable cuando `fetch` al relay lanza (no responde). Las causas típicas en
 * desarrollo: (1) apuntar a la .onion desde un navegador normal, que no resuelve .onion sin
 * Tor, y (2) un bloqueador de anuncios/privacidad cortando la petición (net::ERR_BLOCKED_BY_CLIENT).
 */
function relayUnreachableMessage(baseUrl: string): string {
  return baseUrl.includes(".onion")
    ? "No se pudo contactar con el relay .onion. La sesión protegida necesita el Navegador Tor o Brave con Tor; en desarrollo desactiva la sesión protegida para usar clearnet. Un bloqueador de anuncios/privacidad también puede estar cortando la petición."
    : "No se pudo contactar con el relay. Comprueba que está levantado y que ningún bloqueador del navegador corta la petición.";
}

export type RelayGatewayKind = "onion" | "clearnet";

export interface RelayGateway {
  /** URL base efectiva a la que van las peticiones. */
  url: string;
  /** Tipo de puerta según la URL efectiva (no según lo pedido). */
  kind: RelayGatewayKind;
  /** true si se pidió sesión segura pero no hay .onion configurada → caemos a clearnet. */
  fellBackToClearnet: boolean;
}

/** Describe a qué puerta del relay se está apuntando de verdad para un `secure` dado. */
export function relayGateway(secure: boolean): RelayGateway {
  const url = relayBaseUrl(secure);
  const host = url.replace(/^https?:\/\//, "");
  return {
    url,
    kind: /\.onion(?::\d+)?$/i.test(host) ? "onion" : "clearnet",
    fellBackToClearnet: secure && !ONION_URL,
  };
}

export interface HealthResult {
  status: string; // "ok"
  db: string; // "up" | "down"
}

/**
 * Sondea `/health` del relay por la puerta que corresponda a `secure`.
 * Lanza `RelayError` con status 0 si no se puede contactar (relay caído, o .onion
 * inalcanzable porque el navegador no enruta por Tor — el caller distingue por gateway).
 */
export async function fetchHealth(secure = false): Promise<HealthResult> {
  let res: Response;
  try {
    res = await fetch(`${relayBaseUrl(secure)}/health`, { method: "GET" });
  } catch {
    throw new RelayError(relayUnreachableMessage(relayBaseUrl(secure)), 0);
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

async function request<T>(
  baseUrl: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RelayError(relayUnreachableMessage(baseUrl), 0);
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

function post<T>(baseUrl: string, path: string, body: unknown, token?: string): Promise<T> {
  return request<T>(baseUrl, "POST", path, body, token);
}

/** Firma que produce una firma Ed25519 (64 bytes) sobre un mensaje. */
export type Signer = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * Ejecuta el handshake completo y devuelve la sesión (token) emitida por el relay.
 * `secure` elige la puerta: true → .onion (sesión protegida), false → clearnet.
 */
export async function authenticate(
  publicKeyB64: string,
  sign: Signer,
  secure = false,
): Promise<VerifiedSession> {
  const baseUrl = relayBaseUrl(secure);
  const challenge = await post<ChallengeResponse>(baseUrl, "/auth/challenge", {
    publicKey: publicKeyB64,
  });
  const signature = await sign(fromBase64Url(challenge.message));
  return post<VerifiedSession>(baseUrl, "/auth/verify", {
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

export function fetchMe(token: string, secure = false): Promise<MeResponse> {
  return request<MeResponse>(relayBaseUrl(secure), "GET", "/auth/me", undefined, token);
}

export function logout(token: string, secure = false): Promise<void> {
  return post<void>(relayBaseUrl(secure), "/auth/logout", {}, token);
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
export function claimUsername(
  token: string,
  username: string,
  secure = false,
): Promise<{ username: string }> {
  return request(relayBaseUrl(secure), "PUT", "/directory/username", { username }, token);
}

/** Publica (o rota) la prekey X25519 firmada de esta identidad. */
export function publishPrekey(
  token: string,
  prekey: { x25519PublicKey: string; signature: string },
  secure = false,
): Promise<{ ok: true }> {
  return request(relayBaseUrl(secure), "PUT", "/directory/prekey", prekey, token);
}

/** Busca a un usuario por su handle → identidad + key bundle. */
export function resolveUsername(
  token: string,
  username: string,
  secure = false,
): Promise<DirectoryEntry> {
  const url = `/directory/resolve/${encodeURIComponent(username)}`;
  return request(relayBaseUrl(secure), "GET", url, undefined, token);
}

/** Descarga el key bundle de una identidad por su clave pública (p. ej. tras un QR). */
export function fetchBundle(
  token: string,
  publicKeyB64: string,
  secure = false,
): Promise<DirectoryEntry> {
  const url = `/directory/bundle/${encodeURIComponent(publicKeyB64)}`;
  return request(relayBaseUrl(secure), "GET", url, undefined, token);
}
