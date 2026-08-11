"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { transportStatus } from "@aegis/ui-kit/tokens";
import type { TransportMode } from "@aegis/transport";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import {
  getServerTransportSnapshot,
  getTransportSnapshot,
  subscribeTransportStatus,
} from "@/lib/transport-status";
import {
  currentGateway,
  fetchHealth,
  RelayError,
  type HealthResult,
  type RelayGateway,
} from "@/lib/relay-client";

type Phase = "probing" | "ok" | "down";

interface Probe {
  phase: Phase;
  health: HealthResult | null;
  latencyMs: number | null;
  error: RelayError | null;
  at: string | null; // hora de la última comprobación
}

const INITIAL: Probe = { phase: "probing", health: null, latencyMs: null, error: null, at: null };
const POLL_MS = 8000;

function clock(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** TTL restante en formato compacto: "29d 23h" o "12:04:59" en la última hora. */
function formatTtl(ms: number): string {
  if (ms <= 0) return "expirada";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function Transport() {
  const session = useDashboardSession();
  // La puerta (transporte) se deriva del origen; se fija en un effect para no romper la
  // hidratación (en SSR window no existe → arranca en clearnet/"").
  const [gateway, setGateway] = useState<RelayGateway>({ kind: "clearnet", host: "" });
  useEffect(() => setGateway(currentGateway()), []);

  const [probe, setProbe] = useState<Probe>(INITIAL);
  const [ttl, setTtl] = useState<number>(() =>
    session.expiresAt ? new Date(session.expiresAt).getTime() - Date.now() : 0,
  );
  const busyRef = useRef(false);

  const run = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProbe((p) => ({ ...p, phase: "probing" }));
    const started = performance.now();
    try {
      const health = await fetchHealth();
      setProbe({
        phase: "ok",
        health,
        latencyMs: Math.round(performance.now() - started),
        error: null,
        at: clock(),
      });
    } catch (err) {
      setProbe({
        phase: "down",
        health: null,
        latencyMs: null,
        error: err instanceof RelayError ? err : new RelayError("Error desconocido.", -1),
        at: clock(),
      });
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Sondeo inicial + periódico.
  useEffect(() => {
    run();
    const iv = window.setInterval(run, POLL_MS);
    return () => window.clearInterval(iv);
  }, [run]);

  // Cuenta atrás del TTL (1 s).
  useEffect(() => {
    if (!session.expiresAt) return;
    const target = new Date(session.expiresAt).getTime();
    const iv = window.setInterval(() => setTtl(target - Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [session.expiresAt]);

  const onion = gateway.kind === "onion";
  // El navegador no enruta a .onion salvo bajo Tor: un fallo de red (status 0) contra
  // una puerta .onion casi siempre es "no hay Tor", no "el relay está caído".
  const onionUnreachable = onion && probe.phase === "down" && probe.error?.status === 0;

  const statusColor =
    probe.phase === "ok" ? "#c3f400" : probe.phase === "down" ? "#f87171" : "#fbbf24";
  const statusLabel =
    probe.phase === "ok" ? "Operativo" : probe.phase === "down" ? "Inalcanzable" : "Sondeando…";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-8">
      <div className="max-w-[1100px] mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 border-b border-line pb-4">
          <div>
            <h1 className="font-sans text-2xl md:text-3xl font-bold tracking-tight text-text">
              Estado del transporte
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`w-2 h-2 rounded-full ${probe.phase === "probing" ? "animate-pulse" : ""}`}
                style={{ backgroundColor: statusColor }}
              />
              <span className="font-mono text-[11px] text-muted">
                {statusLabel}
                {probe.at && ` · comprobado ${probe.at}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={probe.phase === "probing"}
            className="self-start md:self-auto label px-4 py-2 border border-line rounded-sm text-muted hover:text-text hover:border-accent/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Reintentar
          </button>
        </header>

        {/* Tiles de estado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Puerta">
            <span className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: onion ? "#c3f400" : "#adc6ff" }}
              />
              <span className="font-mono text-sm text-text">
                {onion ? ".onion" : "clearnet"}
              </span>
            </span>
            <span className="font-mono text-[10px] text-muted-2 break-all mt-1 block">
              {gateway.host || "—"}
            </span>
          </Tile>

          <Tile label="Relay">
            <span className="font-mono text-sm" style={{ color: statusColor }}>
              {statusLabel}
            </span>
            {probe.latencyMs !== null && (
              <span className="font-mono text-[10px] text-muted-2 mt-1 block">
                {probe.latencyMs} ms
              </span>
            )}
          </Tile>

          <Tile label="Base de datos">
            <span
              className="font-mono text-sm"
              style={{ color: probe.health?.db === "up" ? "#c3f400" : "#8e9379" }}
            >
              {probe.health ? probe.health.db : "—"}
            </span>
          </Tile>

          <Tile label="Sesión expira en">
            <span className="font-mono text-sm text-text">{formatTtl(ttl)}</span>
            <span className="font-mono text-[10px] text-muted-2 mt-1 block">
              {groupIdentity(session.id)}
            </span>
          </Tile>
        </div>

        {/* Failover: cómo quedó la elección de modo la última vez que se midió */}
        <Failover />

        {/* Aviso: puerta .onion pero el circuito aún no responde */}
        {onionUnreachable && (
          <Alert tone="warn" title="Circuito .onion no disponible">
            Estás en la puerta <code className="text-text">.onion</code> pero el relay no responde
            por Tor. El circuito puede tardar unos segundos en abrir tras cargar la página: reintenta.
            Si abriste esta <code>.onion</code> fuera del Navegador Tor, no habrá circuito. No es que
            el relay esté caído.
          </Alert>
        )}

        {/* Fallo genérico (relay caído, o error no-red) */}
        {probe.phase === "down" && !onionUnreachable && (
          <Alert tone="error" title="Relay inalcanzable">
            {probe.error?.status === 0
              ? "No hubo respuesta del relay por esta puerta. Reintenta; si persiste, comprueba que el nodo está levantado."
              : probe.error?.message ?? "Error contactando con el relay."}
          </Alert>
        )}

        {/* Disclosure honesto */}
        <div className="mt-4 bg-surface border border-line rounded-sm p-4">
          <p className="text-[13px] leading-relaxed text-muted">
            <span className="text-accent font-mono text-[11px] mr-1.5">[transporte]</span>
            El contenido viaja cifrado extremo a extremo (XChaCha20-Poly1305) y el relay no conoce
            remitente ni destinatario (sealed sender).{" "}
            {onion ? (
              <>
                Tu conexión va por <b className="text-text">Tor</b>: tu IP no es visible para el
                relay.
              </>
            ) : (
              <>
                <b className="text-text">Tu IP sí es visible para el relay</b> salvo que uses la
                puerta <code>.onion</code> bajo Tor.
              </>
            )}
          </p>
        </div>

        {/* Contexto del modelo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {[
            {
              t: "Contenido",
              b: "Payload cifrado indistinguible de bytes aleatorios; el transporte solo mueve ruido.",
            },
            {
              t: "Remitente",
              b: "Sealed sender: el relay entrega el blob sin saber quién lo originó.",
            },
            {
              t: "Destinatario",
              b: "El destino es una clave de sesión efímera (X25519), no una cuenta ni un directorio.",
            },
          ].map((c) => (
            <div key={c.t} className="bg-surface border border-line rounded-sm p-4">
              <h3 className="label text-accent mb-2">{c.t}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{c.b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MODE_LABEL: Record<TransportMode, string> = { relay: "Relay", p2p: "P2P", mesh: "Malla" };
const MODE_ROLE: Record<TransportMode, string> = {
  relay: "Modo A · buzón cifrado, retiene para quien está desconectado",
  p2p: "Modo B · entrega directa, sin pasar por el buzón",
  mesh: "Modo C · malla local por radio, sin internet",
};

/**
 * Estado del failover A→B (Fase 4). El transporte con failover solo corre en el Canal: aquí se
 * muestra su ÚLTIMA lectura, etiquetada como tal. Fingir una medición en vivo sería justo el tipo
 * de mentira cómoda que esta app no se permite.
 */
function Failover() {
  const { status, live } = useSyncExternalStore(
    subscribeTransportStatus,
    getTransportSnapshot,
    getServerTransportSnapshot,
  );

  return (
    <section className="mt-4 bg-surface border border-line rounded-sm">
      <header className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-line">
        <h2 className="label text-accent">Failover de transporte</h2>
        <span className="font-mono text-[10px] text-muted-2">
          {status ? (live ? "en vivo" : "última lectura del Canal") : "sin lecturas"}
        </span>
      </header>

      {status ? (
        <>
          <ul className="divide-y divide-line">
            {status.modes.map((m, i) => (
              <li key={m.mode} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      m.state === "down" ? transportStatus.offline : transportStatus[m.mode],
                    opacity: m.state === "unknown" ? 0.35 : 1,
                  }}
                />
                <div className="min-w-0">
                  <p className="label text-text">
                    {MODE_LABEL[m.mode]}
                    {m.mode === status.activeMode && status.reachable && (
                      <span className="ml-2 text-accent">· activo</span>
                    )}
                  </p>
                  <p className="text-[12px] leading-relaxed text-muted-2 mt-0.5">
                    {MODE_ROLE[m.mode]}
                  </p>
                </div>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-muted text-right tabular-nums">
                  {m.state === "up" ? "con ruta" : m.state === "down" ? "sin ruta" : "sin datos"}
                  {m.state === "up" && m.latencyMs !== null && (
                    <span className="block text-muted-2">{m.latencyMs} ms</span>
                  )}
                  {m.state === "down" && m.failures > 0 && (
                    <span className="block text-muted-2">{m.failures} fallos</span>
                  )}
                </span>
                <span className="sr-only">Preferencia {i + 1}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 border-t border-line text-[13px] leading-relaxed text-muted">
            El envío prueba los modos en este orden y se queda con el primero que entrega. Si el
            preferente vuelve, la ruta regresa sola a él en la siguiente comprobación.
            {status.modes.length === 1 &&
              " Ahora mismo solo hay un candidato: el Modo B no está configurado para esta puerta."}
          </p>
        </>
      ) : (
        <p className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          El failover se mide mientras el <b className="text-text">Canal</b> está abierto: es donde
          vive el transporte. Abre el Canal y vuelve para ver el estado de cada modo.
        </p>
      )}
    </section>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-surface-2 border border-line rounded-sm px-4 py-3">
      <p className="label text-muted-2 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Alert({
  tone,
  title,
  children,
}: {
  tone: "warn" | "info" | "error";
  title: string;
  children: ReactNode;
}) {
  const accent = tone === "warn" ? "#fbbf24" : tone === "error" ? "#f87171" : "#adc6ff";
  return (
    <div
      className="mt-4 rounded-sm p-4 border"
      style={{ borderColor: `${accent}55`, backgroundColor: `${accent}0f` }}
    >
      <p className="label mb-1.5" style={{ color: accent }}>
        {title}
      </p>
      <p className="text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export default function LogsPage() {
  return (
    <DashboardShell>
      <Transport />
    </DashboardShell>
  );
}
