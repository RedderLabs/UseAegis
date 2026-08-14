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

// --- Observabilidad del failover (Fase 4) ---------------------------------------------
//
// El failover deja de ser una caja negra: publica QUÉ modo está entregando ahora y en qué
// estado está cada candidato, para que la UI pueda pintar el punto de estado del header
// (DISENO.md §6) sin conocer la mecánica interna. Es SOLO lectura: nadie fuerza un modo.

/** Estado de un candidato. `unknown` = aún sin evidencia (ni sonda ni envío). */
export type ModeState = "up" | "down" | "unknown";

/** Salud observada de un modo concreto dentro del failover. */
export interface ModeStatus {
  mode: TransportMode;
  state: ModeState;
  /** ms de la última sonda con éxito (`isAvailable`), o null si nunca se midió. */
  latencyMs: number | null;
  /** Fallos consecutivos (envío o sonda) desde el último éxito. */
  failures: number;
  /** Epoch ms en que `state` tomó su valor actual. */
  since: number;
}

/**
 * Última conmutación de modo activo. `cause`:
 *   - `delivery`  — un envío se entregó por otro modo (fallo real en caliente),
 *   - `recovery`  — una sonda devolvió a un modo preferente (p. ej. vuelve el relay),
 *   - `exhausted` — ningún candidato quedó disponible.
 */
export interface FailoverSwitch {
  from: TransportMode | null;
  to: TransportMode;
  at: number;
  cause: "delivery" | "recovery" | "exhausted";
}

/** Foto completa del failover. Inmutable: cada cambio produce un objeto nuevo. */
export interface FailoverStatus {
  /** Modo por el que saldría un envío AHORA (el primer candidato no caído). */
  activeMode: TransportMode;
  /** ¿Hay al menos un candidato con ruta viable? */
  reachable: boolean;
  /** Estado de cada candidato, en orden de preferencia. */
  modes: readonly ModeStatus[];
  lastSwitch: FailoverSwitch | null;
  /** Epoch ms de la última ronda de sondas, o null si aún no hubo ninguna. */
  probedAt: number | null;
}

/** `Transport` que además publica su estado interno (lo devuelve `createFailoverTransport`). */
export interface ObservableTransport extends Transport {
  /** Foto actual del failover. */
  status(): FailoverStatus;
  /** Suscribe a los cambios de estado. Devuelve la baja. */
  onStatus(cb: (status: FailoverStatus) => void): () => void;
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
