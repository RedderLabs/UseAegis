"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import {
  currentGateway,
  fetchHealth,
  RelayError,
  type HealthResult,
  type RelayGateway,
} from "@/lib/relay-client";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";

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
function formatTtl(ms: number, t: Dictionary): string {
  if (ms <= 0) return t.transportPage.expired;
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
  const t = useT();
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
        error: err instanceof RelayError ? err : new RelayError(t.errors.unknown, -1),
        at: clock(),
      });
    } finally {
      busyRef.current = false;
    }
  }, [t]);

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
    probe.phase === "ok"
      ? t.transportPage.statusOk
      : probe.phase === "down"
        ? t.transportPage.statusDown
        : t.transportPage.statusProbing;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-8">
      <div className="max-w-[1100px] mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 border-b border-line pb-4">
          <div>
            <h1 className="font-sans text-2xl md:text-3xl font-bold tracking-tight text-text">
              {t.transportPage.title}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`w-2 h-2 rounded-full ${probe.phase === "probing" ? "animate-pulse" : ""}`}
                style={{ backgroundColor: statusColor }}
              />
              <span className="font-mono text-[11px] text-muted">
                {statusLabel}
                {probe.at && t.transportPage.checkedAt(probe.at)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={probe.phase === "probing"}
            className="self-start md:self-auto label px-4 py-2 border border-line rounded-sm text-muted hover:text-text hover:border-accent/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {t.common.retry}
          </button>
        </header>

        {/* Tiles de estado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label={t.transportPage.tileGateway}>
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

          <Tile label={t.transportPage.tileRelay}>
            <span className="font-mono text-sm" style={{ color: statusColor }}>
              {statusLabel}
            </span>
            {probe.latencyMs !== null && (
              <span className="font-mono text-[10px] text-muted-2 mt-1 block">
                {probe.latencyMs} ms
              </span>
            )}
          </Tile>

          <Tile label={t.transportPage.tileDb}>
            <span
              className="font-mono text-sm"
              style={{ color: probe.health?.db === "up" ? "#c3f400" : "#8e9379" }}
            >
              {probe.health ? probe.health.db : "—"}
            </span>
          </Tile>

          <Tile label={t.transportPage.tileTtl}>
            <span className="font-mono text-sm text-text">{formatTtl(ttl, t)}</span>
            <span className="font-mono text-[10px] text-muted-2 mt-1 block">
              {groupIdentity(session.id)}
            </span>
          </Tile>
        </div>

        {/* Aviso: puerta .onion pero el circuito aún no responde */}
        {onionUnreachable && (
          <Alert tone="warn" title={t.transportPage.onionUnreachableTitle}>
            {t.transportPage.onionUnreachableBodyStart}
            <code className="text-text">.onion</code>
            {t.transportPage.onionUnreachableBodyMiddle}
            <code>.onion</code>
            {t.transportPage.onionUnreachableBodyEnd}
          </Alert>
        )}

        {/* Fallo genérico (relay caído, o error no-red) */}
        {probe.phase === "down" && !onionUnreachable && (
          <Alert tone="error" title={t.transportPage.relayDownTitle}>
            {probe.error?.status === 0
              ? t.transportPage.relayDownNoResponse
              : probe.error?.message ?? t.transportPage.relayDownGeneric}
          </Alert>
        )}

        {/* Disclosure honesto */}
        <div className="mt-4 bg-surface border border-line rounded-sm p-4">
          <p className="text-[13px] leading-relaxed text-muted">
            <span className="text-accent font-mono text-[11px] mr-1.5">[transport]</span>
            {t.transportPage.disclosureStart}
            {onion ? (
              <>
                {t.transportPage.disclosureOnionStart}
                <b className="text-text">Tor</b>
                {t.transportPage.disclosureOnionEnd}
              </>
            ) : (
              <>
                <b className="text-text">{t.transportPage.disclosureClearStart}</b>
                {t.transportPage.disclosureClearEnd}
                <code>.onion</code>
                {t.transportPage.disclosureClearTail}
              </>
            )}
          </p>
        </div>

        {/* Contexto del modelo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {[
            { title: t.transportPage.cards.contentTitle, body: t.transportPage.cards.contentBody },
            { title: t.transportPage.cards.senderTitle, body: t.transportPage.cards.senderBody },
            {
              title: t.transportPage.cards.recipientTitle,
              body: t.transportPage.cards.recipientBody,
            },
          ].map((c) => (
            <div key={c.title} className="bg-surface border border-line rounded-sm p-4">
              <h3 className="label text-accent mb-2">{c.title}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
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
