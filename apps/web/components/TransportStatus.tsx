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
import type { TransportMode } from "@aegis/transport";
import type { Dictionary } from "@/lib/i18n";
import { currentGateway, type RelayGateway } from "@/lib/relay-client";
import {
  getServerTransportSnapshot,
  getTransportSnapshot,
  startAmbientProbe,
  subscribeTransportStatus,
} from "@/lib/transport-status";
import { useT } from "@/lib/i18n/provider";
import { localePath } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/provider";

/** Clave de color del punto: los tres modos, más la ausencia de ruta. */
type DotKey = TransportMode | "offline";

/** "hace 40 s" / "12 min ago". Para el detalle, nunca para el header. */
function ago(at: number, now: number, t: Dictionary): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return t.failover.agoSeconds(s);
  const m = Math.round(s / 60);
  if (m < 60) return t.failover.agoMinutes(m);
  return t.failover.agoHours(Math.round(m / 60));
}

export function TransportStatus({ secure }: { secure: boolean }) {
  const t = useT();
  const locale = useLocale();
  const MODE_LABEL = t.failover.modeLabel;
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
    route = status.reachable ? MODE_LABEL[status.activeMode] : t.failover.noRoute;
  } else if (ambient) {
    dot = ambient.up ? "relay" : "offline";
    route = ambient.up ? MODE_LABEL.relay : t.failover.noRoute;
  } else {
    route = t.failover.probing;
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
        aria-label={t.failover.buttonLabel(
          route,
          secure ? t.failover.torFull : t.failover.unprotectedFull,
          open ? t.failover.hide : t.failover.show,
        )}
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
            {secure ? t.failover.tor : t.failover.unprotected}
          </span>
        </span>
      </button>

      {/* Un cambio de ruta es un cambio de garantías: se anuncia, no solo se colorea. */}
      <span className="sr-only" role="status" aria-live="polite">
        {measured ? t.failover.announce(route) : ""}
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
          aria-label={t.failover.panelLabel}
          className="status-panel fixed left-3 right-3 top-[3.75rem] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[19rem] rounded-sm border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)] z-50"
        >
          {/* Cabecera: la ruta, en grande y con su color */}
          <div className="px-4 pt-3.5 pb-3 border-b border-line">
            <p className="label text-muted-2">{t.failover.activeRoute}</p>
            <p
              className={`font-sans text-lg font-bold tracking-tight mt-0.5 ${measured ? "" : "text-muted"}`}
              style={measured ? { color } : undefined}
            >
              {route}
            </p>
            <p className="text-[12px] leading-relaxed text-muted mt-1">
              {live && status?.reachable
                ? t.failover.modeBlurb[status.activeMode]
                : offline
                  ? t.failover.blurbOffline
                  : live
                    ? t.failover.blurbChecking
                    : t.failover.blurbAmbient}
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
                    {m.state === "up"
                      ? t.failover.stateUp
                      : m.state === "down"
                        ? t.failover.stateDown
                        : t.failover.stateUnknown}
                    {m.state === "up" && m.latencyMs !== null && ` · ${m.latencyMs} ms`}
                  </span>
                </li>
              ))}
              {status.modes.length === 1 && (
                <li className="text-[12px] leading-relaxed text-muted-2 pt-0.5">
                  {t.failover.p2pNotConfigured}
                </li>
              )}
            </ul>
          )}

          {/* Puerta + última conmutación */}
          <dl className="px-4 py-3 space-y-2 border-b border-line">
            <div className="flex items-baseline gap-3">
              <dt className="label text-muted-2 shrink-0">{t.failover.gate}</dt>
              <dd className="ml-auto text-right min-w-0">
                <span className="font-mono text-[11px] text-text">
                  {gateway.kind === "onion" ? t.failover.gateOnion : t.failover.gateClearnet}
                </span>
                <span className="block font-mono text-[10px] text-muted-2 break-all">
                  {gateway.host || "—"}
                </span>
              </dd>
            </div>
            {!secure && (
              <div className="text-[12px] leading-relaxed text-status-p2p">
                {t.failover.ipVisible}
              </div>
            )}
            {live && status?.lastSwitch && (
              <div className="flex items-baseline gap-3">
                <dt className="label text-muted-2 shrink-0">{t.failover.switched}</dt>
                <dd className="ml-auto font-mono text-[11px] text-muted text-right">
                  {MODE_LABEL[status.lastSwitch.to]} · {ago(status.lastSwitch.at, Date.now(), t)}
                </dd>
              </div>
            )}
          </dl>

          <div className="px-4 py-2.5">
            <Link
              href={localePath(locale, "/panel/seguro/dashboard/logs")}
              onClick={() => close(false)}
              className="label text-muted-2 hover:text-accent transition-colors"
            >
              {t.failover.fullStatus}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
