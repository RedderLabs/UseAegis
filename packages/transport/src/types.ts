/**
 * Contrato del transporte (docs/ARQUITECTURA.md §7).
 *
 * El transporte mueve SOBRES OPACOS entre buzones identificados por un PeerID. No cifra, no
 * descifra y no interpreta el contenido: asume que el payload ya viene cifrado E2E (eso es
 * `@aegis/crypto-core`). Su única responsabilidad es entregar y recibir bytes, y —cuando haya
 * varios modos— elegir cuál usar y hacer failover A → B → C sin que el resto del protocolo se
 * entere de por dónde viajó el mensaje.
 */

/** Modo activo de transporte. A = relay (buzón), B = libp2p (P2P), C = mesh (BLE/Wi-Fi Aware). */
export type TransportMode = "relay" | "p2p" | "mesh";

/**
 * Sobre en tránsito. `blob` es opaco (cifrado E2E). `id` identifica el sobre en el backend
 * (para ack/borrado). `cursor` es una marca de orden monótona y comparable como string, con la
 * que se reanuda la recepción sin releer lo ya visto (p. ej. un ISO-8601 o un contador).
 */
export interface WireEnvelope {
  id: string;
  blob: Uint8Array;
  cursor: string;
}

/** Handler de entrantes. Puede ser async; el transporte captura sus errores (no rompen el bucle). */
export type MessageHandler = (env: WireEnvelope) => void | Promise<void>;

/** Interfaz única del transporte, independiente del modo activo. */
export interface Transport {
  /** Modo por el que se está entregando AHORA (en failover, el del último envío con éxito). */
  readonly activeMode: TransportMode;

  /** ¿Está operativo el transporte en este momento? Lo usa el failover para decidir. */
  isAvailable(): Promise<boolean>;

  /** Deja un sobre para `peerId`. Lanza si la entrega falla (para que el failover pruebe otro modo). */
  send(peerId: string, blob: Uint8Array): Promise<void>;

  /** Registra un handler de entrantes. Devuelve una función para darse de baja. */
  onMessage(handler: MessageHandler): () => void;

  /** Arranca la recepción (polling/suscripción). Idempotente: llamarlo dos veces no duplica. */
  start(): void;

  /** Detiene la recepción y libera recursos. Idempotente. */
  stop(): void;
}

/** Programador de temporizadores, inyectable para poder testear el polling de forma determinista. */
export interface Scheduler {
  setInterval(handler: () => void | Promise<void>, ms: number): number;
  clearInterval(id: number): void;
}

/** Scheduler por defecto: los temporizadores del entorno (navegador/Node). */
export const defaultScheduler: Scheduler = {
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms) as unknown as number,
  clearInterval: (id) => globalThis.clearInterval(id),
};
