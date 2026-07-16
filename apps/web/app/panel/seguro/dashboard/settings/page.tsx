"use client";

import { useEffect, useState } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { getToken } from "@/lib/session";
import { claimUsername, fetchMe, RelayError, WEB_ONION_URL } from "@/lib/relay-client";
import { generateUsername } from "@/lib/username";
import { IconCopy, IconDownload } from "@/components/Icons";

function Settings() {
  const session = useDashboardSession();
  const grouped = groupIdentity(session.id);
  const [copied, setCopied] = useState(false);
  // La puerta (transporte) la fija el origen por el que se abrió la app; `session.secure` la
  // guarda al iniciar sesión (true = .onion). Ya NO es un toggle: aquí solo se muestra.
  const onion = session.secure;

  // Nombre de usuario público (handle): con él te encuentran para añadirte como contacto.
  // NO se teclea a mano — se GENERA (palabra + número, legible) y el usuario re-genera hasta que
  // le guste. Así el campo no tiene texto libre (cero superficie de inyección) y siempre es válido.
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoaded, setUsernameLoaded] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  // Lee el nombre actual del servidor y propone un primer candidato (solo en cliente: usa crypto).
  useEffect(() => {
    setCandidate(generateUsername());
    const token = getToken();
    if (!token) {
      setUsernameLoaded(true);
      return;
    }
    fetchMe(token)
      .then((me) => setUsername(me.username))
      .catch(() => {
        /* el servidor puede estar caído; se puede reintentar al guardar */
      })
      .finally(() => setUsernameLoaded(true));
  }, []);

  function regenerate() {
    setNameError(null);
    setNameSaved(false);
    setCandidate(generateUsername());
  }

  async function claimCandidate() {
    const token = getToken();
    if (!token || savingName || !candidate) return;
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      // Reintenta con nombres nuevos por si el sorteo choca con alguno ya existente.
      let attempt = candidate;
      for (let i = 0; i < 6; i++) {
        try {
          const res = await claimUsername(token, attempt);
          setUsername(res.username);
          setCandidate(generateUsername());
          setNameSaved(true);
          window.setTimeout(() => setNameSaved(false), 2500);
          return;
        } catch (err) {
          if (err instanceof RelayError && err.code === "username_taken") {
            attempt = generateUsername(); // otro nombre y a reintentar
            continue;
          }
          throw err;
        }
      }
      setNameError("No conseguimos reservar un nombre libre. Prueba «Regenerar» y de nuevo.");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "No se pudo guardar el nombre.");
    } finally {
      setSavingName(false);
    }
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
        `AEGIS — Huella pública de identidad\n\n${session.id}\n\nEsta es la huella PÚBLICA de tu identidad (sirve para reconocerte o compartirte).\nNO sirve para recuperar el acceso: para eso está el código de recuperación\nque descargaste al crear la identidad.`,
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
        {/* Nombre de usuario público (handle) — se elige UNA vez y es definitivo */}
        <section className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
          <p className="label text-text">Tu nombre de usuario</p>
          <p className="font-mono text-[11px] text-muted-2 mt-1 leading-relaxed">
            Es el nombre público con el que te añaden como contacto. Lo generamos por ti (una
            palabra + un número) para que sea único.{" "}
            <span className="text-muted">
              Se elige una sola vez y queda fijo: no se puede cambiar después.
            </span>
          </p>

          <div className="mt-4 pt-4 border-t border-line">
            <p className="label text-muted-2 mb-1">Ahora mismo</p>
            {!usernameLoaded ? (
              <p className="font-mono text-[13px] text-muted-2">Comprobando…</p>
            ) : username ? (
              <div className="flex items-center gap-3">
                <p className="font-mono text-[15px] text-accent">@{username}</p>
                <button
                  onClick={() => void navigator.clipboard?.writeText(`@${username}`).catch(() => {})}
                  className="inline-flex items-center gap-1 label text-muted-2 hover:text-text transition-colors"
                >
                  <IconCopy className="w-3.5 h-3.5" /> Copiar
                </button>
              </div>
            ) : (
              <p className="font-mono text-[13px] text-muted">
                Todavía no tienes nombre. Elige uno para que puedan añadirte.
              </p>
            )}
          </div>

          {/* Una vez fijado, el nombre es definitivo: se oculta la reclamación. */}
          {usernameLoaded &&
            (username ? (
              <div className="mt-4 flex items-start gap-2 bg-bg border border-line rounded-sm p-3">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <p className="font-mono text-[11px] text-muted-2 leading-relaxed">
                  Tu nombre de usuario es <span className="text-accent">definitivo</span>. Comparte
                  tu <span className="text-text">@{username}</span> completo para que te añadan como
                  contacto.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <p className="label text-muted-2 mb-1.5">Tu nombre propuesto</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex-1 flex items-center bg-bg border border-line rounded-sm px-3 py-2.5">
                    <span className="font-mono text-[15px] text-accent select-all">
                      @{candidate ?? "…"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={regenerate}
                      disabled={savingName}
                      className="shrink-0 label py-2.5 px-4 border border-line text-muted hover:text-text hover:border-accent-dim rounded-sm transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Regenerar
                    </button>
                    <button
                      onClick={claimCandidate}
                      disabled={savingName || !candidate}
                      className="shrink-0 label py-2.5 px-5 bg-accent text-bg font-bold rounded-sm hover:brightness-110 transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {savingName ? "Guardando…" : "Usar este"}
                    </button>
                  </div>
                </div>
                <p className="font-mono text-[11px] text-status-p2p mt-2">
                  Elige con calma: una vez lo confirmes con «Usar este», no podrás cambiarlo.
                </p>
                {nameError && (
                  <p className="font-mono text-[11px] text-status-p2p mt-2">{nameError}</p>
                )}
                {nameSaved && (
                  <p className="font-mono text-[11px] text-accent mt-2">
                    Guardado ✓ · comparte tu @nombre completo para que te añadan.
                  </p>
                )}
              </div>
            ))}
        </section>

        {/* Transporte / puerta */}
        <section className="bg-surface border border-line rounded-sm p-5">
          <p className="label text-text">Conexión</p>
          <p className="font-mono text-[11px] text-muted-2 mt-1">
            La decide la dirección por la que abriste la app: no hay nada que activar. Para el modo
            protegido, abre la <code className="text-text">.onion</code> en el Navegador Tor.
          </p>
          <div className="mt-4 pt-4 border-t border-line flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: onion ? "#c3f400" : "#fbbf24" }}
            />
            <span className="label" style={{ color: onion ? "#c3f400" : "#fbbf24" }}>
              {onion ? "Conexión protegida (Tor)" : "Conexión normal"}
            </span>
          </div>
          <p className="font-mono text-[11px] text-muted-2 mt-3 leading-relaxed">
            {onion
              ? "Tu conexión va por Tor; tu IP no es visible para el servidor."
              : "Tu IP es visible para el servidor."}
            {!onion && WEB_ONION_URL && (
              <>
                {" "}
                Para más anonimato o si hay censura, abre nuestra{" "}
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
