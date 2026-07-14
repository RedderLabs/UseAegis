"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { groupIdentity, IDENTITY_LENGTH } from "@/lib/identity";
import {
  fingerprint16,
  generateSeed,
  publicKeyFromSeed,
  toBase64Url,
} from "@/lib/crypto/ed25519";
import { createKeystore, exportKeystore } from "@/lib/crypto/identity-store";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MIN_PASSPHRASE = 8;

const HANDSHAKE_INIT = [
  "> Inicializando protocolos E2E…",
  "> Sembrando entropía desde el CSPRNG del sistema…",
  "> Derivando par de claves Ed25519 (256 bits)…",
];

interface Candidate {
  seed: Uint8Array;
  publicKeyB64: string;
  fingerprint: string;
}

export default function RegisterPage() {
  const [display, setDisplay] = useState("·".repeat(IDENTITY_LENGTH));
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [logs, setLogs] = useState<string[]>(HANDSHAKE_INIT);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
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
    addLog(`> Clave pública derivada · huella ${fingerprint}`);
  }, [addLog, revealFingerprint]);

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
      setPassError(`La passphrase debe tener al menos ${MIN_PASSPHRASE} caracteres.`);
      return;
    }
    if (passphrase !== confirmPass) {
      setPassError("Las passphrases no coinciden.");
      return;
    }
    setSaving(true);
    try {
      // Sella la semilla con la passphrase (Argon2id + AES-GCM) antes de persistirla:
      // nunca se guarda en claro. Ver lib/crypto/vault.ts.
      await createKeystore(candidate.seed, passphrase);
      setConfirmed(true);
      addLog(`> IDENTIDAD CIFRADA · protegida con tu passphrase (Argon2id)`);
      addLog("> Clave privada cifrada en almacén local · nunca sale del dispositivo");
    } catch (err) {
      setPassError((err as Error).message);
      addLog(`> ERROR al guardar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [logs]);

  // Descarga el CÓDIGO DE RECUPERACIÓN (la semilla): única forma de mover la identidad
  // a otro dispositivo en el modelo "keypair en el dispositivo".
  function downloadRecovery() {
    if (!candidate) return;
    const recovery = toBase64Url(candidate.seed);
    const contents = [
      "AEGIS — Código de recuperación de identidad",
      "",
      `Huella pública: ${candidate.fingerprint}`,
      "",
      "Código de recuperación (mantenlo en secreto — es tu clave privada):",
      recovery,
      "",
      "Con este código puedes restaurar tu identidad en otro dispositivo.",
      "No hay servidor con tus claves: si lo pierdes, nadie puede recuperarla por ti.",
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-recuperacion-${candidate.fingerprint}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("> Exportación del código de recuperación: OK");
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
      a.download = `aegis-keystore-${candidate.fingerprint}.aegis-key.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog("> Exportación del keystore cifrado (USB): OK");
    } catch (err) {
      addLog(`> ERROR al exportar keystore: ${(err as Error).message}`);
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
            <Link href="/" className="mb-6" aria-label="Aegis — inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Aegis.svg" alt="Aegis Secure Messaging" className="h-12 w-auto" />
            </Link>
            <h1 className="font-sans text-3xl md:text-4xl font-bold tracking-tight text-text">
              Génesis de identidad
            </h1>
            <p className="label text-muted-2 mt-2">Sin datos personales</p>
          </div>

          {/* Vault */}
          <div className="relative overflow-hidden bg-surface/70 backdrop-blur-xl border border-line rounded-md p-5 md:p-6 flex flex-col gap-5">
            <div className="scanline" />

            <div className="flex justify-between items-center">
              <span className="label text-accent inline-flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full bg-accent ${confirmed ? "" : "animate-pulse"}`}
                />
                {confirmed ? "Identidad fijada" : "Generada · se fija al confirmar"}
              </span>
              <span className="font-mono text-[11px] text-muted-2">Ed25519 · 256b</span>
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
                Soberanía matemática
              </h2>
              <p className="text-[13px] leading-relaxed text-muted">
                Tu identidad es un par de claves Ed25519 de 256 bits generado en este
                dispositivo. La clave privada se guarda <span className="text-text">cifrada
                con tu passphrase</span> (Argon2id): sin ella, lo almacenado es ruido y nadie
                más puede usar tu identidad. Estas 16 letras son su{" "}
                <span className="text-text">huella pública</span>: sirven para reconocerla, no
                para iniciar sesión tecleándolas. Descarga el código de recuperación para
                restaurarla en otro dispositivo o guardarla en un USB externo.
              </p>
            </div>

            {/* Logs */}
            <div className="bg-surface-2 border border-line rounded-sm p-3">
              <p className="label text-muted mb-2">Handshake</p>
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
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-sans text-base font-semibold text-text">
                      Protege tu identidad
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="label shrink-0 rounded-sm border border-accent/40 px-2 py-1 text-accent hover:bg-accent hover:text-bg transition-colors"
                      aria-pressed={showPass}
                    >
                      {showPass ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    La clave privada se cifra con esta passphrase (Argon2id) antes de guardarse.
                    Se pedirá cada vez que inicies sesión.{" "}
                    <span className="text-text">
                      No hay forma de recuperarla si la olvidas
                    </span>{" "}
                    — para eso está el código de recuperación.
                  </p>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  value={passphrase}
                  autoComplete="new-password"
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={`Passphrase (mín. ${MIN_PASSPHRASE} caracteres)`}
                  className="w-full bg-bg border border-line rounded-sm pl-3 pr-11 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={confirmPass}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Repite la passphrase"
                  className="w-full bg-bg border border-line rounded-sm pl-3 pr-11 py-2.5 font-mono text-sm text-text placeholder:text-muted-2 focus:outline-none focus:border-accent"
                />
                {confirmPass.length > 0 && confirmPass !== passphrase && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">
                    Las passphrases no coinciden todavía.
                  </p>
                )}
                {passError && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{passError}</p>
                )}
              </div>
            )}

            {/* Acciones */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={downloadRecovery}
                disabled={!candidate}
                className="flex-1 label py-3.5 px-4 border border-line hover:border-accent-dim hover:text-text text-muted transition-colors disabled:opacity-40 disabled:pointer-events-none rounded-sm"
              >
                Descargar recuperación
              </button>
              <button
                onClick={confirmIdentity}
                disabled={!candidate || confirmed || saving}
                className="flex-1 label py-3.5 px-4 bg-accent text-bg font-bold hover:brightness-110 transition rounded-sm glow-pulse disabled:opacity-60 disabled:pointer-events-none"
              >
                {confirmed ? "Identidad establecida ✓" : saving ? "Guardando…" : "Confirmar identidad"}
              </button>
            </div>
            {!confirmed && candidate && (
              <button
                onClick={() => void generateCandidate()}
                className="label text-muted-2 hover:text-accent transition-colors self-center"
              >
                Regenerar identidad
              </button>
            )}
            {confirmed && (
              <button
                onClick={downloadKeystore}
                className="label text-muted hover:text-accent transition-colors self-center"
              >
                Exportar keystore cifrado a fichero (USB)
              </button>
            )}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {confirmed ? (
              <Link
                href="/login"
                className="label bg-accent text-bg font-bold px-5 py-3 rounded-sm hover:brightness-110 transition"
              >
                Iniciar sesión →
              </Link>
            ) : (
              <Link
                href="/login"
                className="label text-muted-2 hover:text-accent transition-colors"
              >
                ← Ya tengo una identidad
              </Link>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
