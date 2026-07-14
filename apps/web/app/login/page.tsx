"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupIdentity } from "@/lib/identity";
import { LogoMark } from "@/components/Logo";
import { setFaviconSecure } from "@/lib/favicon";
import { startSession } from "@/lib/session";
import { toBase64Url } from "@/lib/crypto/ed25519";
import {
  buildSignedPrekey,
  getKeystoreStatus,
  importKeystore,
  migrateLegacy,
  signWithUnlockedIdentity,
  unlockFromFile,
  unlockKeystore,
  type IdentityInfo,
  type KeystoreStatus,
} from "@/lib/crypto/identity-store";
import { authenticate, fetchMe, publishPrekey, RelayError } from "@/lib/relay-client";

const MIN_PASSPHRASE = 8;

function describeError(err: unknown): string {
  if (err instanceof RelayError) {
    if (err.status === 0) {
      return "No se pudo contactar con el relay. ¿Está levantado? (pnpm --filter @aegis/relay dev)";
    }
    if (err.code === "signature_verification_failed") return "Firma rechazada por el relay.";
    return `El relay respondió con un error (${err.status}).`;
  }
  return (err as Error)?.message ?? "Error desconocido.";
}

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<KeystoreStatus | null>(null);
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos del formulario (según el estado del keystore).
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");

  // Entrada desde fichero (USB). En modo portátil (persist=false) nada se guarda en el PC.
  const [fileOpen, setFileOpen] = useState(false);
  const [fileJson, setFileJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [persistFile, setPersistFile] = useState(false);

  // Estado del keystore de este dispositivo (NO desbloquea nada: solo mira si existe).
  useEffect(() => {
    getKeystoreStatus()
      .then(setStatus)
      .catch(() => setStatus({ state: "empty" }));
  }, []);

  // El favicon refleja el estado: verde = sesión segura, ámbar = poco segura.
  useEffect(() => {
    setFaviconSecure(secure);
  }, [secure]);
  useEffect(() => {
    return () => setFaviconSecure(true);
  }, []);

  /** Autentica con la semilla ya desbloqueada, abre sesión y publica la prekey si falta. */
  async function finishLogin(identity: IdentityInfo) {
    const session = await authenticate(identity.publicKeyB64, signWithUnlockedIdentity, secure);
    startSession({
      id: identity.fingerprint,
      secure,
      token: session.token,
      publicKey: session.identity.publicKey,
      expiresAt: session.expiresAt,
    });
    // Publica el material de acuerdo de clave (prekey X25519 firmada) si aún no hay uno.
    // Best-effort: si falla, se puede publicar luego desde el panel — no bloquea el acceso.
    try {
      const me = await fetchMe(session.token, secure);
      if (!me.hasPrekey) {
        const pk = await buildSignedPrekey();
        await publishPrekey(
          session.token,
          {
            x25519PublicKey: toBase64Url(pk.x25519PublicKey),
            signature: toBase64Url(pk.signature),
          },
          secure,
        );
      }
    } catch {
      /* el material de contacto se puede publicar más tarde */
    }
    setFaviconSecure(secure);
    router.push("/panel");
  }

  // Desbloquea un keystore cifrado con la passphrase y entra.
  async function onUnlock() {
    if (busy || passphrase.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const identity = await unlockKeystore(passphrase);
      await finishLogin(identity);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  // Cifra una identidad antigua (sin passphrase) con una nueva passphrase y entra.
  async function onMigrate() {
    if (busy) return;
    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`La passphrase debe tener al menos ${MIN_PASSPHRASE} caracteres.`);
      return;
    }
    if (passphrase !== confirmPass) {
      setError("Las passphrases no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const identity = await migrateLegacy(passphrase);
      await finishLogin(identity);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  // Importa desde código de recuperación y protege con una passphrase, luego entra.
  async function onImport() {
    if (busy) return;
    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`La passphrase debe tener al menos ${MIN_PASSPHRASE} caracteres.`);
      return;
    }
    if (passphrase !== confirmPass) {
      setError("Las passphrases no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const identity = await importKeystore(importValue, passphrase);
      await finishLogin(identity);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  // Lee el fichero de keystore elegido por el usuario (desde el USB) a memoria.
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    file
      .text()
      .then(setFileJson)
      .catch(() => setError("No se pudo leer el fichero."));
  }

  // Desbloquea desde el fichero cargado y entra. persistFile decide si se guarda en el PC.
  async function onUnlockFile() {
    if (busy || fileJson.length === 0 || passphrase.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const identity = await unlockFromFile(fileJson, passphrase, { persist: persistFile });
      await finishLogin(identity);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const secureToggle = (
    <button
      type="button"
      onClick={() => setSecure((s) => !s)}
      className="w-full flex items-center justify-between pt-1"
    >
      <span className="flex flex-col text-left">
        <span className="label text-text">Sesión segura</span>
        <span className="font-mono text-[10px] text-muted-2">Borra la caché local al salir</span>
      </span>
      <span
        className={`relative w-11 h-6 rounded-full border transition-colors ${
          secure ? "bg-accent/20 border-accent/40" : "bg-surface-2 border-line"
        }`}
      >
        <span
          className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-all"
          style={{
            backgroundColor: secure ? "#c3f400" : "#8e9379",
            transform: secure ? "translateX(20px)" : "none",
          }}
        />
      </span>
    </button>
  );

  const passphraseInput = (label: string, autoFocus = false) => (
    <div className="space-y-2">
      <label htmlFor="passphrase" className="label text-muted">
        {label}
      </label>
      <input
        id="passphrase"
        type="password"
        value={passphrase}
        autoFocus={autoFocus}
        autoComplete="current-password"
        onChange={(e) => setPassphrase(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && status?.state === "locked") onUnlock();
        }}
        placeholder="Tu passphrase"
        className="w-full bg-bg border border-line rounded-sm px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
      />
    </div>
  );

  const confirmInput = (
    <div className="space-y-2">
      <label htmlFor="confirm" className="label text-muted">
        Repite la passphrase
      </label>
      <input
        id="confirm"
        type="password"
        value={confirmPass}
        autoComplete="new-password"
        onChange={(e) => setConfirmPass(e.target.value)}
        placeholder="Confírmala"
        className="w-full bg-bg border border-line rounded-sm px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
      />
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(195,244,0,0.05),transparent_60%)]" />
      </div>

      <main className="relative z-10 min-h-screen flex items-center justify-center px-5">
        <div className="w-full max-w-[420px]">
          {/* Marca */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative w-20 h-20 mb-4">
              <div className="absolute -inset-2 border border-accent/20 rounded-full scan-ring" />
              <div className="absolute inset-0 flex items-center justify-center">
                <LogoMark className="h-11 w-11" />
              </div>
            </div>
            <Link href="/" className="font-mono font-semibold tracking-[0.14em] text-lg text-text">
              AEGIS
            </Link>
            <p className="label text-muted-2 mt-1">Inicializar sesión</p>
          </div>

          <div className="bg-surface/70 backdrop-blur-xl border border-line rounded-md p-6">
            {status === null ? (
              <p className="label text-muted-2 text-center py-6">Comprobando dispositivo…</p>
            ) : fileOpen ? (
              /* --- Entrar desde fichero de keystore (USB) --- */
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="label text-muted">Keystore desde fichero (USB)</span>
                  <p className="font-mono text-[11px] text-muted-2 leading-relaxed">
                    Elige tu fichero <span className="text-text">.aegis-key.json</span>. En modo
                    portátil la identidad solo vive en memoria durante esta sesión: al cerrar no
                    queda nada en este equipo.
                  </p>
                </div>

                <label className="flex items-center gap-3 border border-line rounded-sm px-3 py-2.5 cursor-pointer hover:border-accent-dim transition-colors">
                  <span className="label text-accent">Elegir fichero</span>
                  <span className="font-mono text-[11px] text-muted-2 truncate">
                    {fileName || "ningún fichero seleccionado"}
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={onFilePicked}
                    className="hidden"
                  />
                </label>

                {passphraseInput("Passphrase")}

                <button
                  type="button"
                  onClick={() => setPersistFile((p) => !p)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="flex flex-col text-left">
                    <span className="label text-text">Recordar en este equipo</span>
                    <span className="font-mono text-[10px] text-muted-2">
                      {persistFile ? "Se guardará el keystore aquí" : "Modo portátil: no se guarda nada"}
                    </span>
                  </span>
                  <span
                    className={`relative w-11 h-6 rounded-full border transition-colors ${
                      persistFile ? "bg-accent/20 border-accent/40" : "bg-surface-2 border-line"
                    }`}
                  >
                    <span
                      className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-all"
                      style={{
                        backgroundColor: persistFile ? "#c3f400" : "#8e9379",
                        transform: persistFile ? "translateX(20px)" : "none",
                      }}
                    />
                  </span>
                </button>

                {secureToggle}

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFileOpen(false);
                      setError(null);
                    }}
                    className="flex-1 label py-3 px-4 border border-line text-muted hover:text-text transition-colors rounded-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onUnlockFile}
                    disabled={busy || fileJson.length === 0 || passphrase.length === 0}
                    className="flex-1 label py-3 px-4 bg-accent text-bg font-bold hover:brightness-110 transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {busy ? "Desbloqueando…" : "Entrar"}
                  </button>
                </div>
              </div>
            ) : status.state === "locked" && !importOpen ? (
              /* --- Keystore cifrado: desbloquear con passphrase --- */
              <div className="space-y-7">
                <div className="space-y-2">
                  <span className="label text-muted flex justify-between items-center">
                    <span>Identidad protegida en este dispositivo</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "#c3f400", boxShadow: "0 0 8px #c3f400" }}
                    />
                  </span>
                  <div className="border-b border-line py-2">
                    <span className="font-mono text-sm md:text-base tracking-[0.12em] text-text">
                      {groupIdentity(status.fingerprint)}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-2">
                    La clave privada está cifrada. Introduce tu passphrase para desbloquearla en
                    esta sesión — nadie más puede usar esta identidad sin ella.
                  </p>
                </div>

                {passphraseInput("Passphrase", true)}
                {secureToggle}

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <button
                  type="button"
                  onClick={onUnlock}
                  disabled={busy || passphrase.length === 0}
                  className="w-full bg-accent text-bg label py-3.5 px-5 hover:brightness-110 active:scale-[0.99] transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                >
                  {busy ? "Desbloqueando…" : "Desbloquear e iniciar sesión"}
                </button>
              </div>
            ) : status.state === "legacy" && !importOpen ? (
              /* --- Identidad antigua sin cifrar: forzar protección con passphrase --- */
              <div className="space-y-6">
                <div className="space-y-2">
                  <span className="label text-status-p2p">Identidad sin cifrar detectada</span>
                  <div className="border-b border-line py-2">
                    <span className="font-mono text-sm tracking-[0.12em] text-text">
                      {groupIdentity(status.fingerprint)}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted leading-relaxed">
                    Esta identidad estaba guardada <span className="text-text">sin protección</span>:
                    cualquiera con acceso al equipo podía usarla. Protégela ahora con una passphrase
                    para cifrarla. A partir de entonces se pedirá al entrar.
                  </p>
                </div>

                {passphraseInput("Nueva passphrase", true)}
                {confirmInput}
                {secureToggle}

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <button
                  type="button"
                  onClick={onMigrate}
                  disabled={busy}
                  className="w-full bg-accent text-bg label py-3.5 px-5 hover:brightness-110 active:scale-[0.99] transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                >
                  {busy ? "Cifrando…" : "Proteger e iniciar sesión"}
                </button>
              </div>
            ) : importOpen ? (
              /* --- Importar identidad desde código de recuperación + passphrase --- */
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="recovery" className="label text-muted">
                    Código de recuperación
                  </label>
                  <textarea
                    id="recovery"
                    value={importValue}
                    onChange={(e) => setImportValue(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder="Pega aquí tu código de recuperación"
                    className="w-full bg-bg border border-line rounded-sm px-3 py-2 font-mono text-[12px] text-text placeholder:text-muted-2 focus:outline-none focus:border-accent break-all"
                  />
                </div>
                {passphraseInput("Passphrase para proteger esta identidad")}
                {confirmInput}
                {secureToggle}

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setImportOpen(false);
                      setError(null);
                    }}
                    className="flex-1 label py-3 px-4 border border-line text-muted hover:text-text transition-colors rounded-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onImport}
                    disabled={busy || importValue.trim().length === 0}
                    className="flex-1 label py-3 px-4 bg-accent text-bg font-bold hover:brightness-110 transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {busy ? "Importando…" : "Importar y entrar"}
                  </button>
                </div>
              </div>
            ) : (
              /* --- No hay identidad: crear o importar --- */
              <div className="space-y-6">
                <p className="text-[13px] text-muted leading-relaxed">
                  No hay ninguna identidad en este dispositivo. Crea una nueva o importa la tuya
                  con el código de recuperación.
                </p>
                <div className="flex flex-col gap-3">
                  <Link
                    href="/register"
                    className="w-full text-center bg-accent text-bg label py-3.5 px-5 hover:brightness-110 transition rounded-sm"
                  >
                    Crear identidad
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setImportOpen(true);
                      setError(null);
                    }}
                    className="label text-muted hover:text-accent transition-colors"
                  >
                    Importar con código de recuperación
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFileOpen(true);
                      setError(null);
                    }}
                    className="label text-muted hover:text-accent transition-colors"
                  >
                    Entrar desde fichero (USB)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Acciones secundarias */}
          <div className="mt-8 flex flex-col items-center gap-4">
            {(status?.state === "locked" || status?.state === "legacy") &&
              !importOpen &&
              !fileOpen && (
                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFileOpen(true);
                      setError(null);
                    }}
                    className="label text-muted hover:text-accent transition-colors"
                  >
                    Entrar desde fichero (USB)
                  </button>
                  <Link
                    href="/register"
                    className="label text-muted hover:text-text transition-colors"
                  >
                    Usar otra identidad
                  </Link>
                </div>
              )}
            <div className="flex items-center gap-3 opacity-40">
              <span className="h-px w-8 bg-line" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                E2E · X25519 / XChaCha20-Poly1305
              </span>
              <span className="h-px w-8 bg-line" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
