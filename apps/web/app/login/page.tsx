"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupIdentity } from "@/lib/identity";
import { LogoMark } from "@/components/Logo";
import { setFaviconSecure } from "@/lib/favicon";
import { startSession } from "@/lib/session";
import {
  getStoredIdentity,
  importIdentity,
  signWithStoredIdentity,
  type IdentityInfo,
} from "@/lib/crypto/identity-store";
import { authenticate, RelayError } from "@/lib/relay-client";

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
  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");

  // Identidad guardada en este dispositivo (IndexedDB).
  useEffect(() => {
    getStoredIdentity()
      .then(setIdentity)
      .catch(() => setIdentity(null))
      .finally(() => setLoaded(true));
  }, []);

  // El favicon refleja el estado: verde = sesión segura, ámbar = poco segura.
  useEffect(() => {
    setFaviconSecure(secure);
  }, [secure]);
  useEffect(() => {
    return () => setFaviconSecure(true);
  }, []);

  async function onLogin() {
    if (!identity || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await authenticate(identity.publicKeyB64, signWithStoredIdentity, secure);
      startSession({
        id: identity.fingerprint,
        secure,
        token: session.token,
        publicKey: session.identity.publicKey,
        expiresAt: session.expiresAt,
      });
      setFaviconSecure(secure);
      router.push("/panel");
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  async function onImport() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const info = await importIdentity(importValue);
      setIdentity(info);
      setImportOpen(false);
      setImportValue("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

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
              href="/"
              className="font-mono font-semibold tracking-[0.14em] text-lg text-text"
            >
              AEGIS
            </Link>
            <p className="label text-muted-2 mt-1">Inicializar sesión</p>
          </div>

          <div className="bg-surface/70 backdrop-blur-xl border border-line rounded-md p-6">
            {!loaded ? (
              <p className="label text-muted-2 text-center py-6">Comprobando dispositivo…</p>
            ) : identity ? (
              /* --- Hay identidad en el dispositivo: autenticación por clave --- */
              <div className="space-y-7">
                <div className="space-y-2">
                  <span className="label text-muted flex justify-between items-center">
                    <span>Identidad de este dispositivo</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "#c3f400", boxShadow: "0 0 8px #c3f400" }}
                    />
                  </span>
                  <div className="border-b border-line py-2">
                    <span className="font-mono text-primary text-sm md:text-base tracking-[0.12em] text-text">
                      {groupIdentity(identity.fingerprint)}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-2">
                    Huella de tu clave pública Ed25519. Se firma un reto del relay con la
                    clave privada guardada aquí — no tecleas nada.
                  </p>
                </div>

                {/* Sesión segura */}
                <button
                  type="button"
                  onClick={() => setSecure((s) => !s)}
                  className="w-full flex items-center justify-between pt-1"
                >
                  <span className="flex flex-col text-left">
                    <span className="label text-text">Sesión segura</span>
                    <span className="font-mono text-[10px] text-muted-2">
                      Borra la caché local al salir
                    </span>
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

                {error && (
                  <p className="font-mono text-[11px] text-status-p2p leading-relaxed">{error}</p>
                )}

                <button
                  type="button"
                  onClick={onLogin}
                  disabled={busy}
                  className="w-full bg-accent text-bg label py-3.5 px-5 hover:brightness-110 active:scale-[0.99] transition rounded-sm disabled:opacity-40 disabled:pointer-events-none"
                >
                  {busy ? "Autenticando…" : "Iniciar sesión"}
                </button>
              </div>
            ) : (
              /* --- No hay identidad: registrar o importar --- */
              <div className="space-y-6">
                <p className="text-[13px] text-muted leading-relaxed">
                  No hay ninguna identidad en este dispositivo. Crea una nueva o importa la
                  tuya con el código de recuperación.
                </p>

                {!importOpen ? (
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
                  </div>
                ) : (
                  <div className="space-y-3">
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
                        {busy ? "Importando…" : "Importar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Acciones secundarias */}
          <div className="mt-8 flex flex-col items-center gap-4">
            {identity && (
              <Link
                href="/register"
                className="label text-muted hover:text-text transition-colors"
              >
                Usar otra identidad
              </Link>
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
