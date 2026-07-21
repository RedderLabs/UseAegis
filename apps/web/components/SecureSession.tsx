"use client";

import { useState } from "react";
import { WEB_ONION_URL } from "@/lib/relay-client";

// Enlace de descarga oficial de Tor Browser (proyecto Tor).
const TOR_DOWNLOAD = "https://www.torproject.org/download/";

// Host .onion "pelado" (sin esquema) para mostrar, y href http:// para abrir en Tor Browser.
const ONION_HOST = WEB_ONION_URL.replace(/^https?:\/\//, "");
const ONION_HREF = ONION_HOST ? `http://${ONION_HOST}` : "";

export function SecureSession() {
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

  return (
    <section id="segura" className="bg-surface border-y border-line">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-24">
        <div className="mb-10 max-w-2xl">
          <p className="label text-accent-dim mb-3">Sesión protegida</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            Para conversar más seguro, entra por Tor
          </h2>
          <p className="mt-3 text-[15px] text-muted">
            En la puerta normal (clearnet) tu contenido va cifrado de extremo a extremo, pero tu{" "}
            <span className="text-text">IP es visible para el relay</span>. Para máxima privacidad
            entra por nuestra <code className="text-text">.onion</code>: el tráfico va por Tor y tu
            IP deja de ser visible. Necesitas el <span className="text-text">Navegador Tor</span>.
          </p>
        </div>

        {/* Pasos */}
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            {
              n: "1",
              t: "Instala el Navegador Tor",
              b: "Descárgalo del sitio oficial del proyecto Tor. Es gratis y de código abierto.",
            },
            {
              n: "2",
              t: "Abre nuestra .onion",
              b: "Pega la dirección .onion en el Navegador Tor. La app carga entera por Tor.",
            },
            {
              n: "3",
              t: "Importa tu identidad y entra",
              b: "Con tu frase de recuperación. Tu misma identidad = tu misma conversación.",
            },
          ].map((s) => (
            <li key={s.n} className="bg-bg border border-line rounded-md p-6">
              <span className="font-mono text-accent text-sm">{s.n}</span>
              <p className="label text-text mt-2">{s.t}</p>
              <p className="text-[13px] leading-relaxed text-muted mt-1.5">{s.b}</p>
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
            Descargar el Navegador Tor ↗
          </a>

          {ONION_HOST ? (
            <>
              <a
                href={ONION_HREF}
                className="inline-flex items-center justify-center gap-2 border border-accent/40 text-accent font-mono text-[13px] px-6 py-3.5 rounded-sm hover:bg-accent/10 transition-colors"
              >
                Abrir la .onion (con Tor)
              </a>
              <button
                type="button"
                onClick={copyOnion}
                className="inline-flex items-center justify-center gap-2 border border-line text-muted font-mono text-[13px] px-6 py-3.5 rounded-sm hover:text-text hover:border-muted transition-colors"
              >
                {copied ? "Copiada ✓" : "Copiar dirección .onion"}
              </button>
            </>
          ) : (
            <span className="font-mono text-[11px] text-muted-2 self-center">
              La dirección .onion aparece en Ajustes una vez dentro.
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
