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
  importFromRecovery,
  migrateLegacy,
  signWithUnlockedIdentity,
  unlockFromFile,
  unlockKeystore,
  type IdentityInfo,
  type KeystoreStatus,
} from "@/lib/crypto/identity-store";
import {
  authenticate,
  fetchMe,
  isOnionSession,
  publishPrekey,
  RelayError,
  WEB_ONION_URL,
} from "@/lib/relay-client";
import { useLocalePath, useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";

const MIN_PASSPHRASE = 8;

function describeError(err: unknown, t: Dictionary): string {
  if (err instanceof RelayError) {
    if (err.status === 0) {
      // El propio RelayError ya trae el texto accionable según la puerta (clearnet vs .onion):
      // en .onion menciona el Navegador Tor / Brave con Tor y el posible bloqueador; en clearnet,
      // relay caído o bloqueador. Respetarlo en vez de pisarlo con un mensaje genérico de clearnet.
      return err.message;
    }
    if (err.code === "signature_verification_failed") return t.login.errors.signatureRejected;
    return t.login.errors.serverError(err.status);
  }
  return (err as Error)?.message ?? t.login.errors.unknown;
}

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const href = useLocalePath();
  const [status, setStatus] = useState<KeystoreStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Puerta actual (.onion vs clearnet), derivada del origen. Se fija en un effect para no
  // provocar mismatch de hidratación (en SSR window no existe → arranca en clearnet).
  const [onion, setOnion] = useState(false);

  // Campos del formulario (según el estado del keystore).
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
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

  // La PUERTA por la que se sirve la web (.onion vs clearnet) determina el modo y el favicon:
  // verde en .onion (protegida), ámbar en clearnet. No hay toggle del usuario.
  useEffect(() => {
    const isOnion = isOnionSession();
    setOnion(isOnion);
    setFaviconSecure(isOnion);
  }, []);

  /** Autentica con la semilla ya desbloqueada, abre sesión y publica la prekey si falta. */
  async function finishLogin(identity: IdentityInfo) {
    const session = await authenticate(identity.publicKeyB64, signWithUnlockedIdentity);
    startSession({
      id: identity.fingerprint,
      token: session.token,
      publicKey: session.identity.publicKey,
      expiresAt: session.expiresAt,
    });
    // Publica el material de acuerdo de clave (prekey X25519 firmada) si aún no hay uno.
    // Best-effort: si falla, se puede publicar luego desde el panel — no bloquea el acceso.
    try {
      const me = await fetchMe(session.token);
      if (!me.hasPrekey) {
        const pk = await buildSignedPrekey();
        await publishPrekey(session.token, {
          x25519PublicKey: toBase64Url(pk.x25519PublicKey),
          signature: toBase64Url(pk.signature),
        });
      }
    } catch {
      /* el material de contacto se puede publicar más tarde */
    }
    router.push(href("/panel"));
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
      setError(describeError(err, t));
      setBusy(false);
    }
  }

  // Cifra una identidad antigua (sin passphrase) con una nueva passphrase y entra.
  async function onMigrate() {
    if (busy) return;
    if (passphrase.length < MIN_PASSPHRASE) {
      setError(t.login.errors.minPassphrase(MIN_PASSPHRASE));
      return;
    }
    if (passphrase !== confirmPass) {
      setError(t.login.errors.passwordsDontMatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const identity = await migrateLegacy(passphrase);
      await finishLogin(identity);
    } catch (err) {
      setError(describeError(err, t));
      setBusy(false);
    }
  }

  // Importa desde código de recuperación y protege con una passphrase, luego entra.
  async function onImport() {
    if (busy) return;
    if (passphrase.length < MIN_PASSPHRASE) {
      setError(t.login.errors.minPassphrase(MIN_PASSPHRASE));
      return;
    }
    if (passphrase !== confirmPass) {
      setError(t.login.errors.passwordsDontMatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const identity = await importFromRecovery(importValue, passphrase);
      await finishLogin(identity);
    } catch (err) {
      setError(describeError(err, t));
      setBusy(false);
    }
  }

  // Lee el fichero de keystore elegido por el usuario (desde el USB) a memoria. Si por error se
  // adjunta el fichero de FRASE de recuperación, no es un keystore: se detecta y se redirige al
  // importador correcto con las 24 palabras ya rellenadas.
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    file
      .text()
      .then(async (text) => {
        const looksLikeKeystore = /"format"\s*:\s*"aegis-keystore"/.test(text);
        if (!looksLikeKeystore) {
          try {
            const { extractRecoveryFromText } = await import("@/lib/crypto/recovery-phrase");
            const phrase = extractRecoveryFromText(text); // lanza si no es una frase
            setImportValue(phrase);
            setFileName("");
            setFileJson("");
            setFileOpen(false);
            setImportOpen(true);
            setError(t.login.errors.wrongFileIsPhrase);
            return;
          } catch {
            /* no es una frase de recuperación: sigue el flujo normal de keystore */
          }
        }
        setFileJson(text);
      })
      .catch(() => setError(t.login.errors.cannotReadFile));
  }

  // Lee el fichero de FRASE de recuperación (.txt) y extrae las 24 palabras al textarea.
  function onRecoveryFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    file
      .text()
      .then(async (text) => {
        const { extractRecoveryFromText } = await import("@/lib/crypto/recovery-phrase");
        setImportValue(extractRecoveryFromText(text)); // lanza con mensaje claro si no hay frase
      })
      .catch((err) => setError((err as Error)?.message ?? t.login.errors.cannotReadFile));
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
      setError(describeError(err, t));
      setBusy(false);
    }
  }

  // Indicador de la PUERTA actual (no un control): el transporte lo decide el origen por el que
  // entras. En clearnet, si conocemos la .onion, invitamos a usarla ante censura/anonimato.
  const gatewayInfo = onion ? (
    <div className="pt-1 flex items-start gap-2 rounded-sm border border-accent/30 bg-accent/5 px-3 py-2">
      <span
        className="mt-[3px] w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: "#c3f400", boxShadow: "0 0 8px #c3f400" }}
      />
      <p className="font-mono text-[10px] leading-relaxed text-muted-2">
        <span className="text-accent">{t.login.gatewaySecure}</span>
        {t.login.gatewaySecureBody}
      </p>
    </div>
  ) : (
    <div className="pt-1 flex items-start gap-2 rounded-sm border border-line px-3 py-2">
      <span
        className="mt-[3px] w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: "#fbbf24" }}
      />
      <p className="font-mono text-[10px] leading-relaxed text-muted-2">
        <span className="text-text">{t.login.gatewayNormal}</span>
        {t.login.gatewayNormalBody}
        {WEB_ONION_URL && (
          <>
            {t.login.gatewayNormalOnionStart}
            <span className="text-accent break-all">{WEB_ONION_URL}</span>
            {t.login.gatewayNormalOnionEnd}
          </>
        )}
      </p>
    </div>
  );

  const passphraseInput = (label: string, autoFocus = false) => (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowPass((s) => !s)}
          className="label shrink-0 rounded-sm border border-accent/40 px-2 py-1 text-accent hover:bg-accent hover:text-bg transition-colors"
          aria-pressed={showPass}
        >
          {showPass ? t.login.hide : t.login.show}
        </button>
        <label htmlFor="passphrase" className="label text-muted">
          {label}
        </label>
      </div>
      <input
        id="passphrase"
        type={showPass ? "text" : "password"}
        value={passphrase}
        autoFocus={autoFocus}
        autoComplete="current-password"
        onChange={(e) => setPassphrase(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && status?.state === "locked") onUnlock();
        }}
        placeholder={t.login.passwordPlaceholder}
        className="w-full bg-bg border border-line rounded-sm pl-3 pr-11 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
      />
    </div>
  );

  const confirmInput = (
    <div className="space-y-2">
      <label htmlFor="confirm" className="label text-muted">
        {t.login.repeatPassword}
      </label>
      <input
        id="confirm"
        type={showPass ? "text" : "password"}
        value={confirmPass}
        autoComplete="new-password"
        onChange={(e) => setConfirmPass(e.target.value)}
        placeholder={t.login.repeatPasswordPlaceholder}
        className="w-full bg-bg border border-line rounded-sm pl-3 pr-11 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
      />
      {confirmPass.length > 0 && confirmPass !== passphrase && (
        <p className="font-mono text-[11px] text-status-p2p leading-relaxed">
          {t.login.passwordsDontMatchYet}
        </p>
      )}
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
            <Link
              href={href("/")}
              className="font-mono font-semibold tracking-[0.14em] text-lg text-text"
            >
              USE AEGIS
            </Link>
            <p className="label text-muted-2 mt-1">{t.login.subtitle}</p>
          </div>

          <div className="bg-surface/70 backdrop-blur-xl border border-line rounded-md p-6">
            {status === null ? (
              <p className="label text-muted-2 text-center py-6">{t.login.checkingDevice}</p>
            ) : fileOpen ? (
              /* --- Entrar desde fichero de keystore (USB) --- */
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="label text-muted">{t.login.file.title}</span>
                  <p className="font-mono text-[11px] text-muted-2 leading-relaxed">
                    {t.login.file.bodyStart}
                    <span className="text-text">.aegis-key.json</span>
                    {t.login.file.bodyEnd}
                  </p>
                </div>

                <label className="flex items-center gap-3 border border-line rounded-sm px-3 py-2.5 cursor-pointer hover:border-accent-dim transition-colors">
                  <span className="label text-accent">{t.login.file.choose}</span>
                  <span className="font-mono text-[11px] text-muted-2 truncate">
                    {fileName || t.login.file.none}
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={onFilePicked}
                    className="hidden"
                  />
                </label>

                {passphraseInput(t.login.password)}

                <button
                  type="button"
                  onClick={() => setPersistFile((p) => !p)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="flex flex-col text-left">
                    <span className="label text-text">{t.login.file.remember}</span>
                    <span className="font-mono text-[10px] text-muted-2">
                      {persistFile ? t.login.file.rememberOn : t.login.file.rememberOff}
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

                {gatewayInfo}

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
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={onUnlockFile}
                    disabled={busy || fileJson.length === 0 || passphrase.length === 0}
                    className="flex-1 label py-3 px-4 bg-accent text-bg font-bold hover:brightness-110 transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {busy ? t.login.file.submitBusy : t.login.file.submit}
                  </button>
                </div>
              </div>
            ) : status.state === "locked" && !importOpen ? (
              /* --- Keystore cifrado: desbloquear con passphrase --- */
              <div className="space-y-7">
                <div className="space-y-2">
                  <span className="label text-muted flex justify-between items-center">
                    <span>{t.login.locked.title}</span>
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
                  <p className="font-mono text-[11px] text-muted-2">{t.login.locked.body}</p>
                </div>

                {passphraseInput(t.login.password, true)}
                {gatewayInfo}

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <button
                  type="button"
                  onClick={onUnlock}
                  disabled={busy || passphrase.length === 0}
                  className="w-full bg-accent text-bg label py-3.5 px-5 hover:brightness-110 active:scale-[0.99] transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                >
                  {busy ? t.login.locked.submitBusy : t.login.locked.submit}
                </button>
              </div>
            ) : status.state === "legacy" && !importOpen ? (
              /* --- Identidad antigua sin cifrar: forzar protección con passphrase --- */
              <div className="space-y-6">
                <div className="space-y-2">
                  <span className="label text-status-p2p">{t.login.legacy.title}</span>
                  <div className="border-b border-line py-2">
                    <span className="font-mono text-sm tracking-[0.12em] text-text">
                      {groupIdentity(status.fingerprint)}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted leading-relaxed">
                    {t.login.legacy.bodyStart}
                    <span className="text-text">{t.login.legacy.bodyUnprotected}</span>
                    {t.login.legacy.bodyEnd}
                  </p>
                </div>

                {passphraseInput(t.login.legacy.newPassword, true)}
                {confirmInput}
                {gatewayInfo}

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <button
                  type="button"
                  onClick={onMigrate}
                  disabled={busy}
                  className="w-full bg-accent text-bg label py-3.5 px-5 hover:brightness-110 active:scale-[0.99] transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                >
                  {busy ? t.login.legacy.submitBusy : t.login.legacy.submit}
                </button>
              </div>
            ) : importOpen ? (
              /* --- Importar identidad desde código de recuperación + passphrase --- */
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="recovery" className="label text-muted">
                      {t.login.import.label}
                    </label>
                    <label className="label text-accent shrink-0 cursor-pointer hover:brightness-110 transition">
                      {t.login.import.attachFile}
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        onChange={onRecoveryFilePicked}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    id="recovery"
                    value={importValue}
                    onChange={(e) => setImportValue(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder={t.login.import.placeholder}
                    className="w-full bg-bg border border-line rounded-sm px-3 py-2 font-mono text-[12px] text-text placeholder:text-muted-2 focus:outline-none focus:border-accent break-all"
                  />
                </div>
                {passphraseInput(t.login.import.passwordLabel)}
                {confirmInput}
                {gatewayInfo}

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
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={onImport}
                    disabled={busy || importValue.trim().length === 0}
                    className="flex-1 label py-3 px-4 bg-accent text-bg font-bold hover:brightness-110 transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {busy ? t.login.import.submitBusy : t.login.import.submit}
                  </button>
                </div>
              </div>
            ) : (
              /* --- No hay identidad: crear o importar --- */
              <div className="space-y-6">
                <p className="text-[13px] text-muted leading-relaxed">{t.login.empty.body}</p>
                <div className="flex flex-col gap-3">
                  <Link
                    href={href("/register")}
                    className="w-full text-center bg-accent text-bg label py-3.5 px-5 hover:brightness-110 transition rounded-sm"
                  >
                    {t.login.empty.create}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setImportOpen(true);
                      setError(null);
                    }}
                    className="label text-muted hover:text-accent transition-colors"
                  >
                    {t.login.empty.importPhrase}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFileOpen(true);
                      setError(null);
                    }}
                    className="label text-muted hover:text-accent transition-colors"
                  >
                    {t.login.empty.fromFile}
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
                    {t.login.empty.fromFile}
                  </button>
                  <Link
                    href={href("/register")}
                    className="label text-muted hover:text-text transition-colors"
                  >
                    {t.login.useAnother}
                  </Link>
                </div>
              )}
            <div className="flex items-center gap-3 opacity-40">
              <span className="h-px w-8 bg-line" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                {t.login.crypto}
              </span>
              <span className="h-px w-8 bg-line" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
