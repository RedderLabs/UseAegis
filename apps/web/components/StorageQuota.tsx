"use client";

/**
 * Barra de espacio de adjuntos (docs/aegis-cuotas-almacenamiento.md §8, paso 2 del plan).
 *
 * El relay lleva un techo por identidad desde el paso 1, pero hasta ahora el usuario solo se
 * enteraba de él CHOCÁNDOSE: un 507 en mitad de un envío. Esta tarjeta pone el número a la vista
 * antes de que haga falta, y con el orden que manda el diseño:
 *
 *   1. lo primero, que la mensajería NO está rota — el límite solo toca archivos y notas de voz;
 *   2. después, la salida gratuita CON FECHA (cuándo se libera y cuánto);
 *   3. y por qué el número es el que es (la cuota madura con la edad de la identidad).
 *
 * Si este despliegue no tiene cuota (relay autoalojado con `QUOTA_MAX_BYTES=0`, o sin media), no
 * se pinta nada: no hay número que enseñar y una barra vacía mentiría.
 *
 * El color NO es el accent lima: ese está reservado a estado criptográfico verificado
 * (`@aegis/ui-kit` README). Aquí es info pasiva → Signal Blue, y `error` solo al topar.
 */

import { useEffect, useState } from "react";
import { getToken } from "@/lib/session";
import { fetchQuota, formatBytes, formatDay, type QuotaStatus } from "@/lib/relay-client";
import { useT } from "@/lib/i18n/provider";

/** Porcentaje ocupado, acotado a [0, 100] (el relay puede haber cobrado y rechazado justo al borde). */
function percentUsed(status: QuotaStatus): number {
  if (status.quota <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((status.used / status.quota) * 100)));
}

export function StorageQuota({ className = "" }: { className?: string }) {
  const t = useT();
  const [status, setStatus] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let alive = true;
    void fetchQuota(token).then((q) => {
      if (alive) setStatus(q);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Sin cuota que mostrar (o aún leyéndola): la tarjeta no existe. Ver cabecera del fichero.
  if (!status) return null;

  const c = t.quota.card;
  const pct = percentUsed(status);
  const full = status.used >= status.quota;
  // Ámbar sería lo esperable a mitad de camino, pero ese token es del indicador de transporte
  // (status-p2p). Con dos estados basta: info pasiva, y "lleno" cuando de verdad lo está.
  const barColor = full || pct >= 90 ? "bg-error" : "bg-secondary";
  const freesDay = status.freesAt ? formatDay(status.freesAt) : null;

  return (
    <div className={`bg-surface border border-line rounded-sm p-5 ${className}`}>
      <div className="flex items-baseline justify-between mb-4 gap-3">
        <h2 className="label text-muted">{c.title}</h2>
        <span className="font-mono text-[12px] text-muted-2">{c.percent(pct)}</span>
      </div>

      {/* Ocupado / techo */}
      <p className="font-mono text-2xl text-text mb-3">
        {c.usedOf(formatBytes(status.used), formatBytes(status.quota))}
      </p>
      <div
        className="h-2 w-full bg-bg border border-line rounded-sm overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={c.title}
      >
        <div className={`h-full ${barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>

      {/* Ráfaga del día: un límite DISTINTO del techo, y se reinicia solo cada día. */}
      {status.dailyLimit > 0 && (
        <p className="font-mono text-[12px] text-muted-2 mt-3">
          {c.todayLabel}:{" "}
          <span className="text-muted">
            {c.todayOf(formatBytes(status.dailyUsed), formatBytes(status.dailyLimit))}
          </span>
        </p>
      )}

      {/* 1) La mensajería no está rota. Es lo primero que teme quien ve una barra llena. */}
      <p className="text-[13px] text-muted mt-4 leading-relaxed">{c.textNote}</p>

      {/* 2) La salida gratuita, con fecha exacta. Nunca "paga o te borro". */}
      <p className="font-mono text-[11px] text-muted-2 mt-3 leading-relaxed">
        {freesDay && status.freesBytes > 0
          ? c.freesOn(formatBytes(status.freesBytes), freesDay)
          : c.freesNothing}
      </p>

      {/* 3) De dónde sale el número: la cuota madura con la edad de la identidad (§4). */}
      <p className="font-mono text-[11px] text-muted-2 mt-2 leading-relaxed">
        {status.quota < status.maxQuota && status.rampDays > 0
          ? c.maturing(formatBytes(status.quota), formatBytes(status.maxQuota), status.rampDays)
          : c.mature(formatBytes(status.maxQuota))}
        {status.ttlDays > 0 && ` ${c.ttlNote(status.ttlDays)}`}
        {status.maxUploadBytes > 0 && ` ${c.perFileNote(formatBytes(status.maxUploadBytes))}`}
      </p>
    </div>
  );
}
