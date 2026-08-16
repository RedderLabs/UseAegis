/**
 * Cliente del relay para el móvil — el MISMO protocolo que la web, sin nada de navegador.
 *
 * Diferencias reales con `apps/web/lib/relay-client.ts`, y por qué:
 *
 *  1. **Origen explícito.** La web va same-origin (`/api`): el transporte sigue la puerta por la que
 *     entraste (clearnet o `.onion`) sin CORS ni toggle. En el móvil no hay "puerta": hay que
 *     apuntar a un origen concreto (`EXPO_PUBLIC_RELAY_ORIGIN`).
 *  2. **Sin SSE de momento.** `openMessageStream` de la web usa `fetch` con streaming a propósito
 *     (EventSource no puede mandar la cabecera de sesión) y el `fetch` de React Native NO hace
 *     streaming. Hasta que se decida (`expo/fetch`, librería de SSE, o servicio nativo), el móvil
 *     usa el mismo POLLING que en la web es la red de seguridad. Funciona; gasta más batería.
 *
 * Lo que NO cambia: el handshake Ed25519, el formato del sobre y la cripto. Eso viene de los
 * paquetes compartidos, y es justo lo que evita que la misma identidad deje de ser la misma persona
 * al cambiar de dispositivo.
 */
import { fromBase64Url, toBase64Url } from "@aegis/crypto-core";

/** Origen del relay. En Expo, las variables públicas se hornean con el prefijo EXPO_PUBLIC_. */
const ORIGIN = (process.env.EXPO_PUBLIC_RELAY_ORIGIN ?? "").replace(/\/+$/, "");

export class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

function url(path: string): string {
  if (!ORIGIN) throw new RelayError("Falta EXPO_PUBLIC_RELAY_ORIGIN: no sé a qué relay hablar.", 0);
  return `${ORIGIN}${path}`;
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path), {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RelayError("No se puede alcanzar el relay.", 0);
  }
  if (!res.ok) {
    throw new RelayError(`El servidor respondió ${res.status}.`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
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

/** Firma Ed25519 (64 bytes) sobre un mensaje. La aporta el keystore; la semilla no cruza. */
export type Signer = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * Handshake completo contra el relay: pide reto, lo firma con la identidad y canjea la firma por
 * una sesión. Idéntico al de la web — mismo endpoint, mismo dominio de firma, mismo token.
 */
export async function authenticate(publicKeyB64: string, sign: Signer): Promise<VerifiedSession> {
  const challenge = await request<ChallengeResponse>("POST", "/auth/challenge", {
    publicKey: publicKeyB64,
  });
  const signature = await sign(fromBase64Url(challenge.message));
  return request<VerifiedSession>("POST", "/auth/verify", {
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

export function health(): Promise<{ status: string; db: string }> {
  return request<{ status: string; db: string }>("GET", "/health");
}
