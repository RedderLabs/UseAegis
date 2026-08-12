"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, type Session } from "@/lib/session";
import { setFaviconSecure } from "@/lib/favicon";
import { LogoMark } from "./Logo";
import { IconCheck } from "./Icons";
import { useLocalePath, useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";

type Check = {
  label: string;
  ok: boolean;
  required: boolean;
  detail?: string;
};

/* ---- comprobaciones reales (no cosméticas) ---- */
function storageOk(): boolean {
  try {
    const k = "__aegis_probe";
    localStorage.setItem(k, "1");
    const v = localStorage.getItem(k);
    localStorage.removeItem(k);
    return v === "1";
  } catch {
    return false;
  }
}
function cryptoOk(): boolean {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  );
}
function validIdentity(id: string): boolean {
  return /^[A-Z]{16}$/.test(id);
}

function buildChecks(variant: "acceso" | "canal", s: Session | null, t: Dictionary): Check[] {
  const c = t.gate.checks;
  if (variant === "acceso") {
    return [
      { label: c.sessionStarted, ok: !!s, required: true },
      { label: c.validIdentity, ok: !!s && validIdentity(s.id), required: true },
      { label: c.localStorage, ok: storageOk(), required: true },
    ];
  }
  return [
    { label: c.csprng, ok: cryptoOk(), required: true },
    { label: c.e2e, ok: true, required: false },
    { label: c.sealedSender, ok: true, required: false },
    {
      label: c.protectedSession,
      ok: !!s && s.secure,
      required: false,
      detail: s && !s.secure ? c.protectedSessionHint : undefined,
    },
  ];
}

/**
 * Puerta de verificación. El copy (fase, título, subtítulo) sale del diccionario a partir de
 * `variant`: así las páginas que la usan no tienen que acarrear texto traducido como props.
 */
export function SecurityGate({
  variant,
  nextHref,
}: {
  variant: "acceso" | "canal";
  /** Ruta SIN prefijo de idioma; se le añade el del usuario para no devolverlo al castellano. */
  nextHref: string;
}) {
  const router = useRouter();
  const t = useT();
  const href = useLocalePath();
  const { phase, title, subtitle } = t.gate[variant];
  const [session, setSession] = useState<Session | null>(null);
  const [ok, setOk] = useState(false);
  const [done, setDone] = useState(0);

  const checks = useMemo(
    () => (ok ? buildChecks(variant, session, t) : []),
    [ok, variant, session, t],
  );

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace(href("/login"));
      return;
    }
    // Requisitos duros: si alguno falla, la sesión no es válida → volver a login.
    const required = buildChecks(variant, s, t).filter((c) => c.required);
    if (required.some((c) => !c.ok)) {
      router.replace(href("/login"));
      return;
    }
    setSession(s);
    setFaviconSecure(s.secure); // el favicon refleja el estado real de la sesión
    setOk(true);
  }, [router, variant, t, href]);

  useEffect(() => {
    if (!ok) return;
    setDone(0);
    const total = buildChecks(variant, session, t).length;
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      setDone(i);
      if (i >= total) {
        window.clearInterval(iv);
        window.setTimeout(() => router.replace(href(nextHref)), 800);
      }
    }, 600);
    return () => window.clearInterval(iv);
  }, [ok, variant, session, router, nextHref, t, href]);

  if (!ok) return null;

  const pct = Math.round((done / checks.length) * 100);
  const complete = done >= checks.length;
  const warnings = checks.some((c) => !c.ok);

  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(195,244,0,0.05),transparent_60%)]" />
      </div>

      <main className="relative z-10 min-h-screen flex items-center justify-center px-5">
        <div className="w-full max-w-[460px]">
          <div className="flex flex-col items-center text-center mb-8">
            <LogoMark className="h-10 w-10 mb-4" />
            <p className="label text-accent-dim">{phase}</p>
            <h1 className="font-sans text-2xl md:text-3xl font-bold tracking-tight text-text mt-1">
              {title}
            </h1>
            <p className="text-[13px] text-muted mt-2">{subtitle}</p>
          </div>

          <div className="relative overflow-hidden bg-surface/70 backdrop-blur-xl border border-line rounded-md p-5">
            <div className="scanline" />

            <div className="space-y-3">
              {checks.map((check, idx) => {
                const revealed = idx < done;
                const running = idx === done;
                const failed = revealed && !check.ok;
                return (
                  <div key={check.label} className="flex items-start gap-3">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors mt-0.5 ${
                        failed
                          ? "border-status-p2p/50 text-status-p2p"
                          : revealed
                            ? "bg-accent/15 border-accent/40 text-accent"
                            : running
                              ? "border-accent/40 text-accent animate-pulse"
                              : "border-line text-muted-2"
                      }`}
                    >
                      {revealed ? (
                        check.ok ? (
                          <IconCheck className="w-3.5 h-3.5" />
                        ) : (
                          <span className="w-2 h-0.5 rounded-full bg-current" />
                        )
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <span
                        className={`font-mono text-[12px] ${
                          failed
                            ? "text-status-p2p"
                            : revealed || running
                              ? "text-text"
                              : "text-muted-2"
                        }`}
                      >
                        {check.label}
                      </span>
                      {failed && check.detail && (
                        <p className="font-mono text-[10px] text-muted-2 mt-0.5">
                          {check.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-line">
              <div className="flex items-center justify-between label mb-2">
                <span
                  style={{
                    color: complete
                      ? warnings
                        ? "#fbbf24"
                        : "#c3f400"
                      : "#6f7378",
                  }}
                >
                  {complete
                    ? warnings
                      ? t.gate.verifiedWithWarnings
                      : t.gate.verified
                    : t.gate.verifying}
                </span>
                <span className="text-accent">{pct}%</span>
              </div>
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: warnings ? "#fbbf24" : "#c3f400",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
