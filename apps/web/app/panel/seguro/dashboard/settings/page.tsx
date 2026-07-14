"use client";

import { useState } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { startSession } from "@/lib/session";
import { setFaviconSecure } from "@/lib/favicon";
import { IconCopy, IconDownload } from "@/components/Icons";

function Settings() {
  const session = useDashboardSession();
  const grouped = groupIdentity(session.id);
  const [secure, setSecure] = useState(session.secure);
  const [copied, setCopied] = useState(false);

  function toggleSecure() {
    const next = !secure;
    setSecure(next);
    // Comprobación real, no cosmética: persiste el estado y refleja el favicon.
    startSession({ ...session, secure: next });
    setFaviconSecure(next);
  }

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
        {/* Sesión segura */}
        <section className="bg-surface border border-line rounded-sm p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="label text-text">Sesión segura</p>
              <p className="font-mono text-[11px] text-muted-2 mt-1">
                Borra la caché local al cerrar sesión (auto-wipe).
              </p>
            </div>
            <button
              type="button"
              onClick={toggleSecure}
              role="switch"
              aria-checked={secure}
              className={`relative w-11 h-6 rounded-full border transition-colors shrink-0 ${
                secure
                  ? "bg-accent/20 border-accent/40"
                  : "bg-surface-2 border-line"
              }`}
            >
              <span
                className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-all"
                style={{
                  backgroundColor: secure ? "#c3f400" : "#8e9379",
                  transform: secure ? "translateX(20px)" : "none",
                }}
              />
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-line flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: secure ? "#c3f400" : "#fbbf24" }}
            />
            <span
              className="label"
              style={{ color: secure ? "#c3f400" : "#fbbf24" }}
            >
              {secure ? "Sesión protegida" : "Sesión sin proteger"}
            </span>
            <span className="font-mono text-[10px] text-muted-2">
              — se refleja en el icono y en el estado de la sesión
            </span>
          </div>
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
