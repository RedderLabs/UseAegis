"use client";

import { useState } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { WEB_ONION_URL } from "@/lib/relay-client";
import { IconCopy, IconDownload } from "@/components/Icons";

function Settings() {
  const session = useDashboardSession();
  const grouped = groupIdentity(session.id);
  const [copied, setCopied] = useState(false);
  // La puerta (transporte) la fija el origen por el que se abrió la app; `session.secure` la
  // guarda al iniciar sesión (true = .onion). Ya NO es un toggle: aquí solo se muestra.
  const onion = session.secure;

  async function copyId() {
    try {
      await navigator.clipboard.writeText(session.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  function downloadId() {
    const blob = new Blob(
      [
        `AEGIS — Huella pública de identidad\n\n${session.id}\n\nEsta es la huella PÚBLICA de tu identidad (para reconocerla o compartirla).\nNO sirve para recuperar el acceso: para eso está el código de recuperación\nque descargaste al crear la identidad.`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-huella-${session.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8">
      <div className="max-w-[1100px] mx-auto">
        <h1 className="font-sans text-3xl font-bold tracking-tight text-text mb-6">
          Ajustes
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Transporte / puerta */}
        <section className="bg-surface border border-line rounded-sm p-5">
          <p className="label text-text">Transporte</p>
          <p className="font-mono text-[11px] text-muted-2 mt-1">
            Lo decide la puerta por la que abriste la app: no hay nada que activar. Para el modo
            protegido, abre la <code className="text-text">.onion</code> en el Navegador Tor.
          </p>
          <div className="mt-4 pt-4 border-t border-line flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: onion ? "#c3f400" : "#fbbf24" }}
            />
            <span className="label" style={{ color: onion ? "#c3f400" : "#fbbf24" }}>
              {onion ? "Puerta protegida (.onion)" : "Puerta normal (clearnet)"}
            </span>
          </div>
          <p className="font-mono text-[11px] text-muted-2 mt-3 leading-relaxed">
            {onion
              ? "El tráfico va por Tor; tu IP no es visible para el relay."
              : "Tu IP es visible para el relay."}
            {!onion && WEB_ONION_URL && (
              <>
                {" "}
                Para anonimato o ante censura, abre nuestra{" "}
                <span className="text-accent break-all">{WEB_ONION_URL}</span> en el Navegador Tor.
              </>
            )}
          </p>
        </section>

        {/* Identidad */}
        <section className="bg-surface border border-line rounded-sm p-5">
          <p className="label text-muted mb-3">Tu identidad</p>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="font-mono text-[13px] text-accent break-all leading-relaxed">
              {grouped}
            </p>
          </div>
          <div className="flex gap-3 mt-3">
            <button
              onClick={copyId}
              className="inline-flex items-center gap-1.5 label text-muted hover:text-text transition-colors"
            >
              <IconCopy className="w-3.5 h-3.5" />
              {copied ? "Copiada" : "Copiar id"}
            </button>
            <button
              onClick={downloadId}
              className="inline-flex items-center gap-1.5 label text-muted hover:text-text transition-colors"
            >
              <IconDownload className="w-3.5 h-3.5" />
              Descargar
            </button>
          </div>
        </section>

        {/* Acerca de */}
        <section className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
          <p className="label text-muted mb-3">Acerca de</p>
          <dl className="space-y-2 font-mono text-[12px]">
            <div className="flex justify-between">
              <dt className="text-muted-2">Idioma</dt>
              <dd className="text-text">Español</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">Cifrado</dt>
              <dd className="text-text">X25519 · XChaCha20-Poly1305</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">Código</dt>
              <dd className="text-accent">Abierto y auditable</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">Auditoría externa</dt>
              <dd className="text-status-p2p">Pendiente</dd>
            </div>
          </dl>
        </section>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardShell>
      <Settings />
    </DashboardShell>
  );
}
