/**
 * Estado de transporte compartido por toda la carcasa del panel (Fase 4).
 *
 * El transporte de chat con failover lo monta SOLO el Canal (`dashboard/page.tsx`), pero el
 * indicador de estado vive en el header (`DashboardShell`), presente en todas las vistas. Este
 * módulo es el puente: un store mínimo al estilo `useSyncExternalStore` (sin dependencias, sin
 * contexto) donde el transporte PUBLICA y el header LEE.
 *
 * Dos fuentes, jamás mezcladas, porque significan cosas distintas:
 *   - `status` — la foto REAL del failover (qué modo entrega, salud de cada candidato). Solo
 *     existe mientras el Canal está montado (`live`).
 *   - `ambient` — una sonda ligera al `/health` del relay para las demás vistas. Dice si el relay
 *     responde, NADA sobre P2P. Se marca como tal para no fingir un failover que no está corriendo.
 *
 * La honestidad de la distinción es el punto: el indicador nunca debe afirmar "vas por P2P" cuando
 * en esa vista no hay ningún transporte P2P vivo.
 */
import type { FailoverStatus } from "@aegis/transport";
import { fetchHealth } from "./relay-client";

/** Sonda ambiente: solo alcanzabilidad del relay, sin failover detrás. */
export interface AmbientProbe {
  up: boolean;
  latencyMs: number | null;
  /** Epoch ms de la medición. */
  at: number;
}

export interface TransportSnapshot {
  /** Foto del failover del Canal, o null si nunca arrancó en esta pestaña. */
  status: FailoverStatus | null;
  /** true mientras el transporte del Canal está corriendo (recepción activa). */
  live: boolean;
  /** Última sonda ligera al relay (vistas sin transporte). null = aún sin medir. */
  ambient: AmbientProbe | null;
}

const EMPTY: TransportSnapshot = { status: null, live: false, ambient: null };

let snapshot: TransportSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(next: TransportSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

/** Suscribe a los cambios. Devuelve la baja (firma de `useSyncExternalStore`). */
export function subscribeTransportStatus(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

/** Foto actual. Referencia ESTABLE entre cambios (requisito de `useSyncExternalStore`). */
export function getTransportSnapshot(): TransportSnapshot {
  return snapshot;
}

/** Foto en SSR: siempre la vacía (no hay transporte ni sondas en el servidor). */
export function getServerTransportSnapshot(): TransportSnapshot {
  return EMPTY;
}

/** Publica la foto del failover. La llama `createChatTransport` en cada cambio de estado. */
export function publishFailoverStatus(status: FailoverStatus): void {
  emit({ ...snapshot, status });
}

/**
 * Marca si el transporte del Canal está corriendo. Al pararlo se conserva la última foto (sigue
 * siendo información válida de hace un momento), pero `live` a false permite al indicador decir
 * que la ruta ya no se está midiendo en esta vista.
 */
export function setTransportLive(live: boolean): void {
  emit({ ...snapshot, live });
}

// --- Sonda ambiente ---------------------------------------------------------------------

const AMBIENT_INTERVAL_MS = 15_000;

let ambientTimer: number | null = null;
let ambientUsers = 0;
let ambientBusy = false;
let ambientCleanup: (() => void) | null = null;

async function probeAmbient(): Promise<void> {
  // Con el failover vivo, su propia sonda ya mide el relay: no se duplica tráfico.
  if (ambientBusy || snapshot.live) return;
  ambientBusy = true;
  const started = performance.now();
  try {
    const health = await fetchHealth();
    emit({
      ...snapshot,
      ambient: {
        up: health.status === "ok",
        latencyMs: Math.round(performance.now() - started),
        at: Date.now(),
      },
    });
  } catch {
    emit({ ...snapshot, ambient: { up: false, latencyMs: null, at: Date.now() } });
  } finally {
    ambientBusy = false;
  }
}

/**
 * Arranca (o se suma a) la sonda ambiente del relay. Con contador de usuarios: varias vistas
 * pueden pedirla y solo se para cuando la suelta la última. Se pausa con la pestaña oculta —una
 * herramienta que sondea en segundo plano gasta batería y deja rastro de tráfico sin motivo.
 * Devuelve la baja.
 */
export function startAmbientProbe(): () => void {
  ambientUsers += 1;
  if (ambientUsers === 1) {
    const tick = () => {
      if (document.visibilityState === "visible") void probeAmbient();
    };
    ambientTimer = window.setInterval(tick, AMBIENT_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    void probeAmbient();
    // La baja del listener viaja con el timer: se guarda para el apagado.
    ambientCleanup = () => document.removeEventListener("visibilitychange", tick);
  }
  return () => {
    ambientUsers -= 1;
    if (ambientUsers > 0 || ambientTimer === null) return;
    window.clearInterval(ambientTimer);
    ambientTimer = null;
    ambientCleanup?.();
    ambientCleanup = null;
  };
}
