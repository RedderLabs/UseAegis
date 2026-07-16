/**
 * Modo A — transporte por RELAY (buzón sealed-sender).
 *
 * Deja sobres en el buzón del destinatario y sondea el propio buzón por un cursor incremental.
 * NO conoce `apps/web`: recibe el acceso al relay y la persistencia del cursor por INYECCIÓN de
 * dependencias (`RelayBackend`, `CursorStore`), de modo que la web lo cablea con su
 * `relay-client` + `localStorage`, y los tests con un relay falso en memoria.
 *
 * Recepción = polling: un bucle a intervalo pide los sobres nuevos (cursor > último visto),
 * avanza el cursor y los reparte a los handlers. No borra al leer (retención bajo TTL en el
 * relay) para poder retomar la conversación al cambiar de puerta o de dispositivo.
 */
import {
  defaultScheduler,
  type MessageHandler,
  type Scheduler,
  type Transport,
  type WireEnvelope,
} from "./types";

/** Acceso al relay que el transporte necesita, sin acoplarse a una implementación concreta. */
export interface RelayBackend {
  /** Deja `blob` en el buzón de `peerId`. Lanza si el relay no responde. */
  send(peerId: string, blob: Uint8Array): Promise<void>;
  /** Sobres del propio buzón con cursor > `after` (todos si `after` es undefined), orden ascendente. */
  fetch(after?: string): Promise<WireEnvelope[]>;
  /** ¿El relay está accesible ahora? (para `isAvailable`/failover). */
  health(): Promise<boolean>;
}

/** Persistencia del cursor de recepción (localStorage en la web, memoria en tests). */
export interface CursorStore {
  load(): string | undefined;
  save(cursor: string): void;
}

export interface RelayTransportOptions {
  backend: RelayBackend;
  cursor: CursorStore;
  /** ms entre sondeos del buzón (por defecto 4000). */
  pollIntervalMs?: number;
  /** Programador de temporizadores (inyectable en tests). Por defecto, el del entorno. */
  scheduler?: Scheduler;
}

const DEFAULT_POLL_MS = 4000;

/** Crea un transporte Modo A (relay) a partir de sus dependencias inyectadas. */
export function createRelayTransport(opts: RelayTransportOptions): Transport {
  const { backend, cursor } = opts;
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
  const scheduler = opts.scheduler ?? defaultScheduler;

  const handlers = new Set<MessageHandler>();
  let timer: number | null = null;
  let polling = false; // evita solapar dos vueltas si una tarda más que el intervalo

  async function dispatch(env: WireEnvelope): Promise<void> {
    for (const handler of handlers) {
      try {
        await handler(env);
      } catch {
        /* un handler defectuoso no debe cortar la entrega al resto ni parar el bucle */
      }
    }
  }

  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      const envelopes = await backend.fetch(cursor.load());
      for (const env of envelopes) {
        cursor.save(env.cursor); // avanza aunque un handler falle: el sobre se dio por entregado
        await dispatch(env);
      }
    } catch {
      /* relay caído o sesión expirada: la próxima vuelta reintenta desde el mismo cursor */
    } finally {
      polling = false;
    }
  }

  return {
    activeMode: "relay",

    isAvailable() {
      return backend.health().catch(() => false);
    },

    send(peerId, blob) {
      return backend.send(peerId, blob);
    },

    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    start() {
      if (timer !== null) return; // idempotente
      timer = scheduler.setInterval(poll, pollMs);
      void poll(); // primera vuelta inmediata, sin esperar al intervalo
    },

    stop() {
      if (timer === null) return;
      scheduler.clearInterval(timer);
      timer = null;
    },
  };
}
