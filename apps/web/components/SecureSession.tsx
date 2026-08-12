"use client";

import { useState } from "react";
import { WEB_ONION_URL } from "@/lib/relay-client";
import { useT } from "@/lib/i18n/provider";

// Enlace de descarga oficial de Tor Browser (proyecto Tor).
const TOR_DOWNLOAD = "https://www.torproject.org/download/";

// Host .onion "pelado" (sin esquema) para mostrar, y href http:// para abrir en Tor Browser.
const ONION_HOST = WEB_ONION_URL.replace(/^https?:\/\//, "");
const ONION_HREF = ONION_HOST ? `http://${ONION_HOST}` : "";

export function SecureSession() {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copyOnion() {
    if (!ONION_HOST) return;
    try {
      await navigator.clipboard.writeText(ONION_HOST);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles no disponible */
    }
  }

  const STEPS = [
    { n: "1", ...t.secureSession.steps.install },
    { n: "2", ...t.secureSession.steps.open },
    { n: "3", ...t.secureSession.steps.import },
  ];

  return (
    <section id="segura" className="bg-surface border-y border-line">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-24">
        <div className="mb-10 max-w-2xl">
          <p className="label text-accent-dim mb-3">{t.secureSession.eyebrow}</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            {t.secureSession.title}
          </h2>
          <p className="mt-3 text-[15px] text-muted">
            {t.secureSession.bodyStart}
            <span className="text-text">{t.secureSession.bodyIpVisible}</span>
            {t.secureSession.bodyMiddle}
            <code className="text-text">.onion</code>
            {t.secureSession.bodyEnd}
            <span className="text-text">{t.secureSession.torBrowser}</span>.
          </p>
        </div>

        {/* Pasos */}
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-bg border border-line rounded-md p-6">
              <span className="font-mono text-accent text-sm">{s.n}</span>
              <p className="label text-text mt-2">{s.title}</p>
              <p className="text-[13px] leading-relaxed text-muted mt-1.5">{s.body}</p>
            </li>
          ))}
        </ol>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <a
            href={TOR_DOWNLOAD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-accent text-bg font-mono font-semibold text-[13px] px-6 py-3.5 rounded-sm hover:brightness-110 transition"
          >
            {t.secureSession.downloadTor}
          </a>

          {ONION_HOST ? (
            <>
              <a
                href={ONION_HREF}
                className="inline-flex items-center justify-center gap-2 border border-accent/40 text-accent font-mono text-[13px] px-6 py-3.5 rounded-sm hover:bg-accent/10 transition-colors"
              >
                {t.secureSession.openOnion}
              </a>
              <button
                type="button"
                onClick={copyOnion}
                className="inline-flex items-center justify-center gap-2 border border-line text-muted font-mono text-[13px] px-6 py-3.5 rounded-sm hover:text-text hover:border-muted transition-colors"
              >
                {copied ? t.secureSession.copiedOnion : t.secureSession.copyOnion}
              </button>
            </>
          ) : (
            <span className="font-mono text-[11px] text-muted-2 self-center">
              {t.secureSession.onionInSettings}
            </span>
          )}
        </div>

        {ONION_HOST && (
          <p className="mt-4 font-mono text-[11px] text-muted-2 break-all">
            <span className="text-muted">.onion:</span> {ONION_HOST}
          </p>
        )}
      </div>
    </section>
  );
}
