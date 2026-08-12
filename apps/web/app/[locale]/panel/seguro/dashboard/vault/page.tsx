"use client";

import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { IconDownload, IconShield, IconKey } from "@/components/Icons";
import { useT } from "@/lib/i18n/provider";

function Vault() {
  const session = useDashboardSession();
  const t = useT();
  const grouped = groupIdentity(session.id);

  // Los VALORES son identificadores criptográficos (no se traducen); solo la etiqueta cambia.
  const HEALTH = [
    { label: t.vault.health.content, value: "XChaCha20-Poly1305" },
    { label: t.vault.health.kex, value: t.vault.health.kexValue },
    { label: t.vault.health.identity, value: "Ed25519" },
    { label: t.vault.health.sender, value: "Sealed sender" },
  ];

  const KEYS = [
    { tag: t.vault.keys.identityTag, value: "Ed25519", note: t.vault.keys.identityNote },
    { tag: t.vault.keys.sessionTag, value: "X25519", note: t.vault.keys.sessionNote },
  ];

  function downloadId() {
    const contents = [
      t.vault.file.header,
      "",
      session.id,
      "",
      t.vault.file.line1,
      t.vault.file.line2,
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t.vault.file.filename(session.id);
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
              {t.vault.title}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <p className="font-mono text-[12px] text-muted">
                {t.vault.serverDataLabel}
                <span className="text-accent">{t.vault.serverDataValue}</span>
              </p>
            </div>
          </div>
          <div className="bg-surface-2 border border-line rounded-sm px-4 py-3">
            <p className="label text-muted-2 mb-1">{t.vault.plaintextStored}</p>
            <p className="font-mono text-2xl text-accent">{t.vault.zeroBytes}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Salud de seguridad */}
          <div className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <IconShield className="w-4 h-4 text-accent" />
              <h2 className="label text-muted">{t.vault.healthTitle}</h2>
            </div>
            <div className="space-y-2">
              {HEALTH.map((h) => (
                <div
                  key={h.label}
                  className="flex items-center justify-between bg-bg border border-line rounded-sm px-3 py-2.5"
                >
                  <span className="text-[13px] text-muted">{h.label}</span>
                  <span className="font-mono text-[12px] text-accent">{h.value}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] text-muted-2 mt-4 leading-relaxed">
              {t.vault.healthNote}
            </p>
          </div>

          {/* Respaldo de identidad */}
          <div className="bg-surface border border-line rounded-sm p-5 flex flex-col">
            <h2 className="label text-muted mb-3">{t.vault.backupTitle}</h2>
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
              {t.vault.downloadIdentity}
            </button>
            <p className="font-mono text-[10px] text-muted-2 mt-3 leading-relaxed">
              {t.vault.backupNote}
            </p>
          </div>

          {/* Claves activas */}
          <div className="md:col-span-3 bg-surface border border-line rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <IconKey className="w-4 h-4 text-accent" />
              <h2 className="label text-muted">{t.vault.keysTitle}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {KEYS.map((k) => (
                <div key={k.tag} className="bg-bg border border-line rounded-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[14px] text-text">{k.value}</span>
                    <span className="label text-muted-2">{k.tag}</span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-2">{k.note}</p>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] text-muted-2 mt-4 leading-relaxed">
              {t.vault.keysNote}
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
