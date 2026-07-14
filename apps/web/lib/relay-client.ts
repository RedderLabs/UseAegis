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
    throw new RelayError("No se pudo contactar con el relay.", 0);
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

async function post<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RelayError("No se pudo contactar con el relay.", 0);
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

export function fetchMe(
  token: string,
  secure = false,
): Promise<{ publicKey: string; fingerprint: string; sessionId: string }> {
  return fetch(`${relayBaseUrl(secure)}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  }).then(async (res) => {
    if (!res.ok) throw new RelayError("Sesión no válida.", res.status);
    return res.json();
  });
}

export function logout(token: string, secure = false): Promise<void> {
  return post<void>(relayBaseUrl(secure), "/auth/logout", {}, token);
}
