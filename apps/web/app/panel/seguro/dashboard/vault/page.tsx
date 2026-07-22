"use client";

import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { IconDownload, IconShield, IconKey } from "@/components/Icons";

const HEALTH = [
  { label: "Cifrado de contenido", value: "XChaCha20-Poly1305" },
  { label: "Acuerdo de claves", value: "X25519 (ECDH por sesión)" },
  { label: "Identidad / firma", value: "Ed25519" },
  { label: "Remitente frente al servidor", value: "Sealed sender" },
];

const KEYS = [
  { tag: "IDENTIDAD", value: "Ed25519", note: "estable, tu identidad" },
  { tag: "SESIÓN", value: "X25519", note: "efímera, por conversación" },
];

function Vault() {
  const session = useDashboardSession();
  const grouped = groupIdentity(session.id);

  function downloadId() {
    const contents = [
      "AEGIS — Identidad",
      "",
      session.id,
      "",
      "Guárdala en un lugar seguro. Es tu única forma de recuperar el acceso.",
      "No hay servidor con tus claves: nadie puede regenerarla por ti.",
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-identidad-${session.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-sans text-3xl font-bold tracking-tight text-text">
              Bóveda de privacidad
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <p className="font-mono text-[12px] text-muted">
                Datos que guarda el servidor:{" "}
                <span className="text-accent">mínimos</span>
              </p>
            </div>
          </div>
          <div className="bg-surface-2 border border-line rounded-sm px-4 py-3">
            <p className="label text-muted-2 mb-1">Contenido en claro guardado</p>
            <p className="font-mono text-2xl text-accent">0 bytes</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Salud de seguridad */}
          <div className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <IconShield className="w-4 h-4 text-accent" />
              <h2 className="label text-muted">Salud del cifrado</h2>
            </div>
            <div className="space-y-2">
              {HEALTH.map((h) => (
                <div
                  key={h.label}
                  className="flex items-center justify-between bg-bg border border-line rounded-sm px-3 py-2.5"
                >
                  <span className="text-[13px] text-muted">{h.label}</span>
                  <span className="font-mono text-[12px] text-accent">
                    {h.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] text-muted-2 mt-4 leading-relaxed">
              Usamos criptografía estándar y auditada (libsodium). No inventamos
              cifrado propio. El cifrado es el mismo vaya por donde vaya el mensaje.
            </p>
          </div>

          {/* Respaldo de identidad */}
          <div className="bg-surface border border-line rounded-sm p-5 flex flex-col">
            <h2 className="label text-muted mb-3">Respaldo de identidad</h2>
            <div className="bg-bg border border-line rounded-sm p-3 flex-1">
              <p className="font-mono text-[12px] text-accent break-all leading-relaxed">
                {grouped}
              </p>
            </div>
            <button
              onClick={downloadId}
              className="mt-3 inline-flex items-center justify-center gap-2 border border-line hover:border-accent-dim hover:text-text text-muted label py-2.5 rounded-sm transition-colors"
            >
              <IconDownload className="w-4 h-4" />
              Descargar identidad
            </button>
            <p className="font-mono text-[10px] text-muted-2 mt-3 leading-relaxed">
              Sin recuperación centralizada: si la pierdes, no hay forma de
              regenerarla.
            </p>
          </div>

          {/* Claves activas */}
          <div className="md:col-span-3 bg-surface border border-line rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <IconKey className="w-4 h-4 text-accent" />
              <h2 className="label text-muted">Claves activas</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {KEYS.map((k) => (
                <div
                  key={k.tag}
                  className="bg-bg border border-line rounded-sm p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[14px] text-text">
                      {k.value}
                    </span>
                    <span className="label text-muted-2">{k.tag}</span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-2">{k.note}</p>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] text-muted-2 mt-4 leading-relaxed">
              Ningún servidor guarda tus claves: viven solo en tu dispositivo. Sin
              RSA ni hardware especial, solo criptografía moderna (curvas elípticas).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <DashboardShell>
      <Vault />
    </DashboardShell>
  );
}
