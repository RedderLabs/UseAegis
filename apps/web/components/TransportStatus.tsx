"use client";

/**
 * Indicador de transporte del header (DISENO.md §6, Fase 4).
 *
 * Regla del diseño: en el header, lo único que cambia de forma permanente es el COLOR del punto.
 * Verde = relay, ámbar = P2P, naranja = malla, rojo = sin ruta. Nada de texto explicativo
 * permanente: el detalle se abre BAJO DEMANDA al pulsar el punto ("cero fricción visual").
 *
 * La etiqueta corta que acompaña al punto —`RELAY · TOR`— no es explicación, es lectura de
 * instrumento: la ruta por la que sale tu mensaje y la puerta por la que estás entrando. Ambos
 * datos ya estaban en el header antes de esta fase (el estado de sesión); aquí se agrupan en un
 * único control, y el resto pasa al panel de detalle.
 *
 * Honestidad del indicador: el failover con P2P solo corre en el Canal. En las demás vistas el
 * punto refleja una sonda ligera al relay, y el panel lo dice con todas las letras en vez de
 * fingir un modo activo que nadie está midiendo.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { colors, transportStatus } from "@aegis/ui-kit/tokens";
import type { ModeStatus, TransportMode } from "@aegis/transport";
import { currentGateway, type RelayGateway } from "@/lib/relay-client";
import {
  getServerTransportSnapshot,
  getTransportSnapshot,
  startAmbientProbe,
  subscribeTransportStatus,
} from "@/lib/transport-status";

/** Clave de color del punto: los tres modos, más la ausencia de ruta. */
type DotKey = TransportMode | "offline";

const MODE_LABEL: Record<TransportMode, string> = {
  relay: "Relay",
  p2p: "P2P",
  mesh: "Malla",
};

/** Qué es cada modo, en una línea, sin jerga de red. */
const MODE_BLURB: Record<TransportMode, string> = {
  relay: "Buzón cifrado del servidor. Guarda el sobre hasta que el otro se conecta.",
  p2p: "Entrega directa entre navegadores. No pasa por el buzón: el otro tiene que estar conectado.",
  mesh: "Malla local por radio, sin internet.",
};

const STATE_LABEL: Record<ModeStatus["state"], string> = {
  up: "con ruta",
  down: "sin ruta",
  unknown: "sin datos",
};

/** "hace 40 s" / "hace 12 min" / "hace 3 h". Para el detalle, nunca para el header. */
function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

export function TransportStatus({ secure }: { secure: boolean }) {
  const snapshot = useSyncExternalStore(
    subscribeTransportStatus,
    getTransportSnapshot,
    getServerTransportSnapshot,
  );

  // La puerta se deriva del origen: en un effect, para no romper la hidratación.
  const [gateway, setGateway] = useState<RelayGateway>({ kind: "clearnet", host: "" });
  useEffect(() => setGateway(currentGateway()), []);

  // Sonda ligera al relay para las vistas sin transporte (el store la ignora si el Canal está vivo).
  useEffect(() => startAmbientProbe(), []);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Cerrar con Escape o al pulsar fuera. El foco vuelve al punto (no se pierde en el header).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const { status, live, ambient } = snapshot;

  // --- Lectura del instrumento ----------------------------------------------------------
  //
  // Con el Canal montado manda el failover REAL. Sin él, solo se sabe si el relay responde.
  let dot: DotKey | null = null; // null = todavía sin medida (arranque)
  let route: string;
  if (live && status) {
    dot = status.reachable ? status.activeMode : "offline";
    route = status.reachable ? MODE_LABEL[status.activeMode] : "Sin ruta";
  } else if (ambient) {
    dot = ambient.up ? "relay" : "offline";
    route = ambient.up ? MODE_LABEL.relay : "Sin ruta";
  } else {
    route = "Sondeando";
  }

  const color = dot ? transportStatus[dot] : colors["muted-2"];
  const offline = dot === "offline";
  const measured = dot !== null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Transporte: ${route}. Puerta: ${secure ? "Tor" : "sin proteger"}. ${
          open ? "Ocultar" : "Ver"
        } detalle`}
        className="flex items-center gap-2 -mx-2 px-2 min-h-[2.75rem] sm:min-h-0 sm:py-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent/60 hover:bg-surface-2/60 transition-colors"
      >
        <span className="relative flex items-center justify-center w-2.5 h-2.5">
          {/* Halo: solo cuando hay medida. Late si no hay ruta — la única animación permitida aquí. */}
          <span
            aria-hidden
            className={`absolute inset-0 rounded-full ${offline ? "status-alarm" : ""}`}
            style={{
              backgroundColor: color,
              opacity: measured ? 0.22 : 0.12,
              transform: measured ? "scale(2.1)" : "scale(1.6)",
            }}
          />
          <span
            className="relative w-1.5 h-1.5 rounded-full transition-colors duration-300"
            style={{
              backgroundColor: color,
              boxShadow: measured && !offline ? `0 0 7px ${color}` : undefined,
            }}
          />
        </span>

        <span className="hidden sm:flex items-baseline gap-1.5 label leading-none">
          <span
            className={`transition-colors duration-300 ${measured ? "" : "text-muted-2"}`}
            style={measured ? { color } : undefined}
          >
            {route}
          </span>
          <span aria-hidden className="text-line">
            ·
          </span>
          <span className={secure ? "text-muted-2" : "text-status-p2p"}>
            {secure ? "Tor" : "Sin proteger"}
          </span>
        </span>
      </button>

      {/* Un cambio de ruta es un cambio de garantías: se anuncia, no solo se colorea. */}
      <span className="sr-only" role="status" aria-live="polite">
        {measured ? `Transporte: ${route}` : ""}
      </span>

      {/*
        Panel de detalle. Móvil: hoja anclada bajo el header, a lo ancho de la pantalla (el punto
        está cerca del borde izquierdo, así que un panel anclado a él se saldría por la derecha).
        A partir de `sm`: popover anclado al propio punto.
      */}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          // Divulgación simple, no diálogo modal: el foco no se secuestra (el punto vive en el
          // header y bloquear el tabulado por un panel informativo sería peor que no tenerlo).
          // El lector de pantalla llega al panel justo después del botón, en orden de DOM.
          role="group"
          aria-label="Detalle del transporte"
          className="status-panel fixed left-3 right-3 top-[3.75rem] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[19rem] rounded-sm border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)] z-50"
        >
          {/* Cabecera: la ruta, en grande y con su color */}
          <div className="px-4 pt-3.5 pb-3 border-b border-line">
            <p className="label text-muted-2">Ruta activa</p>
            <p
              className={`font-sans text-lg font-bold tracking-tight mt-0.5 ${measured ? "" : "text-muted"}`}
              style={measured ? { color } : undefined}
            >
              {route}
            </p>
            <p className="text-[12px] leading-relaxed text-muted mt-1">
              {live && status?.reachable
                ? MODE_BLURB[status.activeMode]
                : offline
                  ? "Ningún modo responde ahora mismo. Lo que envíes fallará hasta que vuelva alguno."
                  : live
                    ? "Comprobando qué modos tienen ruta…"
                    : "Fuera del Canal solo se comprueba el relay. La ruta real (con P2P) se decide al abrir el Canal."}
            </p>
          </div>

          {/* Candidatos del failover, en orden de preferencia */}
          {live && status && (
            <ul className="px-4 py-3 border-b border-line space-y-2">
              {status.modes.map((m) => (
                <li key={m.mode} className="flex items-center gap-2.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        m.state === "down" ? transportStatus.offline : transportStatus[m.mode],
                      opacity: m.state === "unknown" ? 0.35 : 1,
                    }}
                  />
                  <span className="label text-text">{MODE_LABEL[m.mode]}</span>
                  <span className="font-mono text-[11px] text-muted-2 ml-auto tabular-nums">
                    {STATE_LABEL[m.state]}
                    {m.state === "up" && m.latencyMs !== null && ` · ${m.latencyMs} ms`}
                  </span>
                </li>
              ))}
              {status.modes.length === 1 && (
                <li className="text-[12px] leading-relaxed text-muted-2 pt-0.5">
                  El modo P2P no está configurado para esta puerta: solo hay relay.
                </li>
              )}
            </ul>
          )}

          {/* Puerta + última conmutación */}
          <dl className="px-4 py-3 space-y-2 border-b border-line">
            <div className="flex items-baseline gap-3">
              <dt className="label text-muted-2 shrink-0">Puerta</dt>
              <dd className="ml-auto text-right min-w-0">
                <span className="font-mono text-[11px] text-text">
                  {gateway.kind === "onion" ? ".onion (Tor)" : "clearnet"}
                </span>
                <span className="block font-mono text-[10px] text-muted-2 break-all">
                  {gateway.host || "—"}
                </span>
              </dd>
            </div>
            {!secure && (
              <div className="text-[12px] leading-relaxed text-status-p2p">
                Tu IP es visible para el relay. El contenido sigue cifrado extremo a extremo.
              </div>
            )}
            {live && status?.lastSwitch && (
              <div className="flex items-baseline gap-3">
                <dt className="label text-muted-2 shrink-0">Conmutó</dt>
                <dd className="ml-auto font-mono text-[11px] text-muted text-right">
                  {MODE_LABEL[status.lastSwitch.to]} · {ago(status.lastSwitch.at, Date.now())}
                </dd>
              </div>
            )}
          </dl>

          <div className="px-4 py-2.5">
            <Link
              href="/panel/seguro/dashboard/logs"
              onClick={() => close(false)}
              className="label text-muted-2 hover:text-accent transition-colors"
            >
              Estado completo →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
