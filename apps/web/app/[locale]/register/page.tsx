"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { groupIdentity, IDENTITY_LENGTH } from "@/lib/identity";
import {
  fingerprint16,
  generateSeed,
  publicKeyFromSeed,
  toBase64Url,
} from "@/lib/crypto/ed25519";
import { createKeystore, exportKeystore } from "@/lib/crypto/identity-store";
import { seedToPhrase } from "@/lib/crypto/recovery-phrase";
import { generatePassword, PASSWORD_LENGTHS } from "@/lib/password-gen";
import { useLocalePath, useT } from "@/lib/i18n/provider";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MIN_PASSPHRASE = 8;

interface Candidate {
  seed: Uint8Array;
  publicKeyB64: string;
  fingerprint: string;
}

export default function RegisterPage() {
  const t = useT();
  const href = useLocalePath();
  const [display, setDisplay] = useState("·".repeat(IDENTITY_LENGTH));
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [logs, setLogs] = useState<string[]>(t.register.handshakeInit);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  // Opciones del generador de contraseña fuerte (para la contraseña que cifra la bóveda).
  const [pwLen, setPwLen] = useState<number>(24);
  const [pwSymbols, setPwSymbols] = useState(true);
  const [copiedPhrase, setCopiedPhrase] = useState(false);

  // Frase de recuperación (24 palabras BIP39) de la semilla candidata. Es la MISMA identidad,
  // solo codificada como palabras para poder anotarla sin errores.
  const phrase = useMemo(() => (candidate ? seedToPhrase(candidate.seed) : null), [candidate]);

  async function copyPhrase() {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopiedPhrase(true);
      window.setTimeout(() => setCopiedPhrase(false), 1500);
    } catch {
      /* noop */
    }
  }

  // Genera una contraseña fuerte (CSPRNG), la rellena en ambos campos y la muestra para copiarla.
  function fillGeneratedPassword() {
    const pw = generatePassword(pwLen, pwSymbols);
    setPassphrase(pw);
    setConfirmPass(pw);
    setShowPass(true);
    setPassError(null);
  }
  const logRef = useRef<HTMLDivElement>(null);
  const scrambleRef = useRef<number | null>(null);

  const addLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, line].slice(-40));
  }, []);

  // Anima la revelación de la huella (ruido visual → huella real).
  const revealFingerprint = useCallback((target: string) => {
    if (scrambleRef.current) window.clearInterval(scrambleRef.current);
    let revealed = 0;
    scrambleRef.current = window.setInterval(() => {
      let current = "";
      for (let i = 0; i < IDENTITY_LENGTH; i++) {
        current +=
          i < Math.floor(revealed)
            ? target[i]
            : ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
      setDisplay(current);
      revealed += 0.8;
      if (revealed >= IDENTITY_LENGTH) {
        if (scrambleRef.current) window.clearInterval(scrambleRef.current);
        setDisplay(target);
      }
    }, 45);
  }, []);

  // Genera una identidad candidata REAL (semilla Ed25519 + clave pública + huella).
  const generateCandidate = useCallback(async () => {
    const seed = generateSeed();
    const publicKey = await publicKeyFromSeed(seed);
    const fingerprint = await fingerprint16(publicKey);
    setCandidate({ seed, publicKeyB64: toBase64Url(publicKey), fingerprint });
    revealFingerprint(fingerprint);
    addLog(t.register.logKeyDerived(fingerprint));
  }, [addLog, revealFingerprint, t]);

  useEffect(() => {
    void generateCandidate();
    return () => {
      if (scrambleRef.current) window.clearInterval(scrambleRef.current);
    };
  }, [generateCandidate]);

  async function confirmIdentity() {
    if (!candidate || confirmed || saving) return;
    setPassError(null);
    if (passphrase.length < MIN_PASSPHRASE) {
      setPassError(t.login.errors.minPassphrase(MIN_PASSPHRASE));
      return;
    }
    if (passphrase !== confirmPass) {
      setPassError(t.login.errors.passwordsDontMatch);
      return;
    }
    setSaving(true);
    try {
      // Sella la semilla con la passphrase (Argon2id + AES-GCM) antes de persistirla:
      // nunca se guarda en claro. Ver lib/crypto/vault.ts.
      await createKeystore(candidate.seed, passphrase);
      setConfirmed(true);
      addLog(t.register.logEncrypted);
      addLog(t.register.logStored);
    } catch (err) {
      setPassError((err as Error).message);
      addLog(t.register.logSaveError((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [logs]);

  // Descarga la FRASE DE RECUPERACIÓN (BIP39, 24 palabras = la semilla): única forma de mover la
  // identidad a otro dispositivo en el modelo "keypair en el dispositivo".
  function downloadRecovery() {
    if (!candidate) return;
    const phrase = seedToPhrase(candidate.seed);
    // Palabras numeradas, en columnas, para copiar a mano sin equivocarse.
    const numbered = phrase
      .split(" ")
      .map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`)
      .join("\n");
    const f = t.register.recoveryFile;
    const contents = [
      f.header,
      "",
      f.fingerprint(candidate.fingerprint),
      "",
      f.phraseLabel,
      "",
      phrase,
      "",
      numbered,
      "",
      f.footer1,
      f.footer2,
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.filename(candidate.fingerprint);
    a.click();
    URL.revokeObjectURL(url);
    addLog(t.register.logRecoveryExported);
  }

  // Exporta el KEYSTORE CIFRADO a un fichero (p. ej. para guardarlo en un USB). A diferencia
  // del código de recuperación (semilla en claro), esto es el blob ya cifrado con la
  // passphrase: solo sirve junto con ella. Requiere haber confirmado (keystore ya creado).
  async function downloadKeystore() {
    if (!candidate) return;
    try {
      const json = await exportKeystore();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `useaegis-keystore-${candidate.fingerprint}.aegis-key.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog(t.register.logKeystoreExported);
    } catch (err) {
      addLog(t.register.logKeystoreError((err as Error).message));
    }
  }

  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-accent/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-accent/5 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-5 py-16">
        <div className="w-full max-w-[560px]">
          {/* Cabecera */}
          <div className="flex flex-col items-center text-center mb-8">
            <Link href={href("/")} className="mb-6" aria-label={t.register.logoAlt}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Aegis.svg" alt={t.register.imgAlt} className="h-12 w-auto" />
            </Link>
            <h1 className="font-sans text-3xl md:text-4xl font-bold tracking-tight text-text">
              {t.register.title}
            </h1>
            <p className="label text-muted-2 mt-2">{t.register.subtitle}</p>
          </div>

          {/* Vault */}
          <div className="relative overflow-hidden bg-surface/70 backdrop-blur-xl border border-line rounded-md p-5 md:p-6 flex flex-col gap-5">
            <div className="scanline" />

            <div className="flex justify-between items-center">
              <span className="label text-accent inline-flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full bg-accent ${confirmed ? "" : "animate-pulse"}`}
                />
                {confirmed ? t.register.fixed : t.register.generated}
              </span>
              <span className="font-mono text-[11px] text-muted-2">{t.register.algo}</span>
            </div>

            {/* Huella de la identidad */}
            <div className="h-36 bg-bg border border-line rounded-sm flex items-center justify-center relative">
              <div
                className={`font-mono text-lg md:text-2xl tracking-[0.15em] text-accent ${
                  candidate ? "" : "caret"
                }`}
              >
                {groupIdentity(display)}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="font-sans text-lg font-semibold text-text">
                {t.register.controlTitle}
              </h2>
              <p className="text-[13px] leading-relaxed text-muted">
                {t.register.controlBodyStart}
                <span className="text-text">{t.register.controlBodyEncrypted}</span>
                {t.register.controlBodyMiddle}
                <span className="text-text">{t.register.controlBodyFingerprint}</span>
                {t.register.controlBodyEnd}
              </p>
            </div>

            {/* Logs */}
            <div className="bg-surface-2 border border-line rounded-sm p-3">
              <p className="label text-muted mb-2">{t.register.handshake}</p>
              <div
                ref={logRef}
                className="font-mono text-[11px] leading-relaxed text-muted-2 h-28 overflow-y-auto space-y-0.5"
              >
                {logs.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>

            {/* Passphrase que cifra la identidad en este dispositivo */}
            {!confirmed && (
              <div className="space-y-3 border-t border-line pt-4">
                <div className="space-y-1">
                  <h2 className="font-sans text-base font-semibold text-text">
                    {t.register.protectTitle}
                  </h2>
                  <p className="text-[12px] leading-relaxed text-muted">
                    {t.register.protectBodyStart}
                    <span className="text-text">{t.register.protectBodyStrong}</span>
                    {t.register.protectBodyEnd}
                  </p>
                </div>

                {/* Generador de contraseña fuerte (recomendado) */}
                <div className="rounded-sm border border-accent/25 bg-accent/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="label text-accent">{t.register.generatorTitle}</p>
                    <span className="font-mono text-[10px] text-muted-2">
                      {t.register.recommended}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-2">{t.register.length}</span>
                    {PASSWORD_LENGTHS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPwLen(n)}
                        className={`label rounded-sm border px-2.5 py-1 transition-colors ${
                          pwLen === n
                            ? "border-accent/50 text-accent bg-accent/10"
                            : "border-line text-muted hover:text-text"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPwSymbols((s) => !s)}
                      aria-pressed={pwSymbols}
                      className={`label rounded-sm border px-2.5 py-1 transition-colors ${
                        pwSymbols
                          ? "border-accent/50 text-accent bg-accent/10"
                          : "border-line text-muted hover:text-text"
                      }`}
                    >
                      {t.register.symbols}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={fillGeneratedPassword}
                    className="w-full label py-2.5 bg-accent text-bg font-bold rounded-sm hover:brightness-110 transition"
                  >
                    {t.register.generate}
                  </button>
                  <p className="font-mono text-[10px] text-muted-2 leading-relaxed">
                    {t.register.generatorNote}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="label w-fit rounded-sm border border-accent/40 px-2 py-1 text-accent hover:bg-accent hover:text-bg transition-colors"
                  aria-pressed={showPass}
                >
                  {showPass ? t.register.hidePassword : t.register.showPassword}
                </button>
                <input
                  type={showPass ? "text" : "password"}
                  value={passphrase}
                  autoComplete="new-password"
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={t.register.passwordPlaceholder(MIN_PASSPHRASE)}
                  className="w-full bg-bg border border-line rounded-sm pl-3 pr-11 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={confirmPass}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder={t.register.repeatPlaceholder}
                  className="w-full bg-bg border border-line rounded-sm pl-3 pr-11 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
                />
                {confirmPass.length > 0 && confirmPass !== passphrase && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">
                    {t.login.passwordsDontMatchYet}
                  </p>
                )}
                {passError && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{passError}</p>
                )}
              </div>
            )}

            {/* Frase de recuperación (24 palabras) — anótala antes de confirmar */}
            {phrase && (
              <div className="border-t border-line pt-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-sans text-base font-semibold text-text">
                    {t.register.phraseTitle}
                  </h2>
                  <button
                    onClick={copyPhrase}
                    className="label text-muted-2 hover:text-accent transition-colors shrink-0"
                  >
                    {copiedPhrase ? t.register.phraseCopied : t.common.copy}
                  </button>
                </div>
                <p className="text-[12px] leading-relaxed text-muted">
                  {t.register.phraseBodyStart}
                  <span className="text-text">{t.register.phraseBodyStrong}</span>
                  {t.register.phraseBodyEnd}
                </p>
                <ol className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 bg-bg border border-line rounded-sm p-3">
                  {phrase.split(" ").map((word, i) => (
                    <li key={i} className="flex items-baseline gap-2 font-mono text-[12px]">
                      <span className="text-muted-2 tabular-nums w-5 text-right shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-accent select-all">{word}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Acciones */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={downloadRecovery}
                disabled={!candidate}
                className="flex-1 label py-3.5 px-4 border border-line hover:border-accent-dim hover:text-text text-muted transition-colors disabled:opacity-40 disabled:pointer-events-none rounded-sm"
              >
                {t.register.downloadRecovery}
              </button>
              <button
                onClick={confirmIdentity}
                disabled={!candidate || confirmed || saving}
                className="flex-1 label py-3.5 px-4 bg-accent text-bg font-bold hover:brightness-110 transition rounded-sm glow-pulse disabled:opacity-60 disabled:pointer-events-none"
              >
                {confirmed
                  ? t.register.confirmed
                  : saving
                    ? t.common.saving
                    : t.register.confirm}
              </button>
            </div>
            {!confirmed && candidate && (
              <button
                onClick={() => void generateCandidate()}
                className="label text-muted-2 hover:text-accent transition-colors self-center"
              >
                {t.register.regenerate}
              </button>
            )}
            {confirmed && (
              <button
                onClick={downloadKeystore}
                className="label text-muted hover:text-accent transition-colors self-center"
              >
                {t.register.exportKeystore}
              </button>
            )}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {confirmed ? (
              <Link
                href={href("/login")}
                className="label bg-accent text-bg font-bold px-5 py-3 rounded-sm hover:brightness-110 transition"
              >
                {t.register.goLogin}
              </Link>
            ) : (
              <Link
                href={href("/login")}
                className="label text-muted-2 hover:text-accent transition-colors"
              >
                {t.register.haveIdentity}
              </Link>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
