/**
 * Failover A → B → C. Envuelve varios transportes concretos (relay, p2p, mesh) tras la misma
 * interfaz `Transport`, de modo que el resto del protocolo nunca sabe por cuál viajó el mensaje.
 *
 *  - send(): prueba los candidatos por PREFERENCIA, saltando los que ya se dan por caídos (van
 *    igualmente al final como último recurso: nunca se renuncia a intentar). Si todos fallan,
 *    propaga el último error.
 *  - recepción: escucha en TODOS los candidatos a la vez y deduplica por `id`, porque un mismo
 *    sobre podría llegar por más de una vía (p. ej. relay y mesh) durante una transición.
 *
 * Fase 4 — CONMUTACIÓN AUTOMÁTICA. El failover ya no es solo "prueba y reza": lleva la salud de
 * cada candidato y conmuta sin que nadie se lo pida.
 *
 *   · Detección: `failureThreshold` fallos CONSECUTIVOS (de envío o de sonda) marcan un modo como
 *     caído. Un solo error de red no basta: eso evita bandazos del indicador por un 500 suelto.
 *   · Conmutación: el modo activo es el PRIMER candidato no caído. Al caer el relay, el activo pasa
 *     a P2P sin esperar a que el usuario mande nada.
 *   · Recuperación: una ronda de sondas (`isAvailable`) cada `probeIntervalMs` devuelve el modo
 *     activo al candidato más preferente en cuanto vuelve. Es lo que hace que el punto del header
 *     regrese a verde solo, sin recargar.
 *   · Observabilidad: cada cambio publica un `FailoverStatus` a los suscriptores de `onStatus`
 *     (lo consume el indicador del header, DISENO.md §6).
 *
 * La política vive AQUÍ y solo aquí: los candidatos siguen siendo tontos (mueven bytes y lanzan si
 * no pueden), y el cliente de chat sigue sin enterarse de por dónde salió el sobre.
 */
import {
  defaultScheduler,
  type FailoverStatus,
  type FailoverSwitch,
  type MessageHandler,
  type ModeState,
  type ModeStatus,
  type ObservableTransport,
  type Scheduler,
  type Transport,
  type TransportMode,
  type WireEnvelope,
} from "./types";

/** Cuántos ids recordar para deduplicar entrantes entre vías (cota para no crecer sin límite). */
const SEEN_LIMIT = 4096;

/** Fallos consecutivos que marcan un modo como caído. 2 = un error suelto no mueve el indicador. */
const DEFAULT_FAILURE_THRESHOLD = 2;

/** Ritmo de las sondas de salud. Manda la recuperación: es lo que tarda el verde en volver. */
const DEFAULT_PROBE_INTERVAL_MS = 15_000;

export interface FailoverOptions {
  /** Fallos consecutivos antes de dar un modo por caído (por defecto 2). */
  failureThreshold?: number;
  /** ms entre rondas de sondas de salud mientras el transporte está arrancado (por defecto 15000). */
  probeIntervalMs?: number;
  /** Programador de temporizadores (inyectable en tests). Por defecto, el del entorno. */
  scheduler?: Scheduler;
  /** Reloj (inyectable en tests). Por defecto `Date.now`. */
  now?: () => number;
}

/** Estado interno mutable de un candidato. Se proyecta a `ModeStatus` al publicar. */
interface Record_ {
  transport: Transport;
  mode: TransportMode;
  state: ModeState;
  failures: number;
  latencyMs: number | null;
  since: number;
}

/** Crea un transporte con failover sobre `candidates`, probados en el orden dado (= preferencia). */
export function createFailoverTransport(
  candidates: Transport[],
  opts: FailoverOptions = {},
): ObservableTransport {
  if (candidates.length === 0) {
    throw new Error("createFailoverTransport requiere al menos un transporte.");
  }

  const threshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const probeMs = opts.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
  const scheduler = opts.scheduler ?? defaultScheduler;
  const now = opts.now ?? (() => Date.now());

  const records: Record_[] = candidates.map((transport) => ({
    transport,
    mode: transport.activeMode,
    state: "unknown",
    failures: 0,
    latencyMs: null,
    since: now(),
  }));

  const seen = new Set<string>();
  // Bajas de las suscripciones abiertas en los candidatos, por handler externo.
  const unsubscribes = new Map<MessageHandler, Array<() => void>>();
  const watchers = new Set<(status: FailoverStatus) => void>();

  let activeMode: TransportMode = records[0]!.mode;
  let lastSwitch: FailoverSwitch | null = null;
  let probedAt: number | null = null;
  let probeTimer: number | null = null;
  let probing = false; // evita solapar dos rondas si una tarda más que el intervalo
  let snapshot: FailoverStatus = buildSnapshot();

  // --- Estado publicado ----------------------------------------------------------------

  function buildSnapshot(): FailoverStatus {
    return {
      activeMode,
      reachable: records.some((r) => r.state === "up"),
      modes: records.map<ModeStatus>((r) => ({
        mode: r.mode,
        state: r.state,
        latencyMs: r.latencyMs,
        failures: r.failures,
        since: r.since,
      })),
      lastSwitch,
      probedAt,
    };
  }

  /** ¿Cambió algo que la UI deba ver? (evita repintar el header en cada sonda idéntica). */
  function differs(a: FailoverStatus, b: FailoverStatus): boolean {
    if (a.activeMode !== b.activeMode || a.reachable !== b.reachable) return true;
    if (a.lastSwitch !== b.lastSwitch) return true;
    return a.modes.some((m, i) => {
      const o = b.modes[i];
      return !o || m.state !== o.state || m.latencyMs !== o.latencyMs || m.failures !== o.failures;
    });
  }

  /**
   * Candidato que representa la ruta REAL ahora mismo. Se distingue "fallar" de "estar caído":
   *   1. el primero sano — ni caído ni con fallos pendientes: por ahí sale lo tuyo,
   *   2. si ninguno está limpio, el primero no caído — falló, pero aún no se le da por muerto,
   *   3. si todos cayeron, el preferente — el envío seguirá intentándolo ("sin ruta" no es
   *      lo mismo que "no intentarlo").
   * Gracias a (1), el indicador refleja la conmutación en el PRIMER fallo de entrega, mientras que
   * el `state` (lo que se AFIRMA de un modo) sigue exigiendo `failureThreshold` fallos seguidos.
   */
  function route(): Record_ {
    return (
      records.find((r) => r.state !== "down" && r.failures === 0) ??
      records.find((r) => r.state !== "down") ??
      records[0]!
    );
  }

  /** Recalcula el modo activo y publica si hubo cambio real. `cause` describe por qué se recalcula. */
  function settle(cause: FailoverSwitch["cause"]): void {
    const next = route();
    if (next.mode !== activeMode) {
      lastSwitch = { from: activeMode, to: next.mode, at: now(), cause };
      activeMode = next.mode;
    }
    const fresh = buildSnapshot();
    if (!differs(fresh, snapshot)) return;
    snapshot = fresh;
    for (const watcher of watchers) {
      try {
        watcher(snapshot);
      } catch {
        /* un observador defectuoso no debe afectar al transporte */
      }
    }
  }

  function markUp(rec: Record_, latencyMs: number | null): void {
    if (rec.state !== "up") rec.since = now();
    rec.state = "up";
    rec.failures = 0;
    if (latencyMs !== null) rec.latencyMs = latencyMs;
  }

  function markFailure(rec: Record_): void {
    rec.failures += 1;
    if (rec.failures < threshold || rec.state === "down") return;
    rec.state = "down";
    rec.latencyMs = null;
    rec.since = now();
  }

  // --- Sondas de salud (la mitad "recuperación" de la conmutación automática) -----------

  /**
   * Pregunta a todos los candidatos si tienen ruta AHORA y actualiza su estado. Es la vía por la
   * que un modo caído vuelve solo: sin esto, el usuario se quedaría en P2P hasta el próximo envío.
   */
  async function probe(): Promise<void> {
    if (probing) return;
    probing = true;
    try {
      await Promise.all(
        records.map(async (rec) => {
          const started = now();
          try {
            const ok = await rec.transport.isAvailable();
            if (ok) markUp(rec, Math.max(0, now() - started));
            else markFailure(rec);
          } catch {
            markFailure(rec);
          }
        }),
      );
      probedAt = now();
      settle("recovery");
    } finally {
      probing = false;
    }
  }

  /** Deduplica por id: true la primera vez que se ve un sobre, false si ya se entregó. */
  function firstSight(env: WireEnvelope): boolean {
    if (seen.has(env.id)) return false;
    if (seen.size >= SEEN_LIMIT) seen.clear(); // olvido en bloque: simple y acotado para el MVP
    seen.add(env.id);
    return true;
  }

  return {
    get activeMode() {
      return activeMode;
    },

    status() {
      return snapshot;
    },

    onStatus(cb) {
      watchers.add(cb);
      cb(snapshot); // entrega inmediata: el suscriptor no espera al primer cambio para pintar
      return () => void watchers.delete(cb);
    },

    async isAvailable() {
      const results = await Promise.all(candidates.map((c) => c.isAvailable().catch(() => false)));
      return results.some(Boolean);
    },

    async send(peerId, blob) {
      // Orden de intento: preferentes primero; los caídos van al final como último recurso (podrían
      // haberse recuperado entre sondas, y fallar del todo es peor que gastar un intento de más).
      const order = [
        ...records.filter((r) => r.state !== "down"),
        ...records.filter((r) => r.state === "down"),
      ];
      let lastError: unknown;
      for (const rec of order) {
        try {
          await rec.transport.send(peerId, blob);
          markUp(rec, null);
          settle("delivery");
          return;
        } catch (err) {
          lastError = err; // este modo no pudo; probamos el siguiente
          markFailure(rec);
        }
      }
      settle("exhausted");
      throw lastError instanceof Error
        ? lastError
        : new Error("Ningún transporte pudo entregar el mensaje.");
    },

    onMessage(handler) {
      // El mismo handler externo se registra en cada candidato, pero solo se le entrega la
      // PRIMERA aparición de cada sobre (dedup por id).
      const deduped: MessageHandler = (env) => (firstSight(env) ? handler(env) : undefined);
      const offs = candidates.map((c) => c.onMessage(deduped));
      unsubscribes.set(handler, offs);
      return () => {
        for (const off of unsubscribes.get(handler) ?? []) off();
        unsubscribes.delete(handler);
      };
    },

    start() {
      for (const c of candidates) c.start();
      if (probeTimer !== null) return; // idempotente
      probeTimer = scheduler.setInterval(probe, probeMs);
      void probe(); // primera foto inmediata: el header no arranca en "desconocido"
    },

    stop() {
      for (const c of candidates) c.stop();
      if (probeTimer === null) return;
      scheduler.clearInterval(probeTimer);
      probeTimer = null;
    },
  };
}
