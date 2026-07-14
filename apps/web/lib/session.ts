/**
 * Sesión del cliente web. Ahora respalda una sesión REAL del relay: tras el handshake
 * Ed25519 (ver lib/relay-client.ts) se guarda el token emitido por el relay junto con
 * la identidad. El par de claves vive en IndexedDB (lib/crypto/identity-store.ts); aquí
 * solo persiste el token de sesión y datos de presentación.
 *
 * `id` sigue siendo la huella de 16 letras (derivada de la clave pública) y `secure` el
 * toggle de sesión segura — ambos los leen los gates de /panel y el favicon.
 */

const SESSION_KEY = "aegis.session";

export interface Session {
  id: string; // huella de 16 letras (A–Z) derivada de la clave pública
  secure: boolean; // toggle "sesión segura" del login
  token: string; // bearer token emitido por el relay
  publicKey: string; // clave pública en base64url
  expiresAt: string; // ISO-8601
}

export function startSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    // Sesión expirada según el relay → se descarta.
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Token de la sesión actual para peticiones autenticadas, o null. */
export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function endSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}
