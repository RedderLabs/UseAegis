"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "./Logo";
import { groupIdentity } from "@/lib/identity";
import { endSession, getSession, getToken, type Session } from "@/lib/session";
import { logout } from "@/lib/relay-client";
import { isUnlocked, lockKeystore } from "@/lib/crypto/identity-store";
import { unreadCount } from "@/lib/chat";
import { setFaviconSecure } from "@/lib/favicon";
import {
  IconChat,
  IconUsers,
  IconKey,
  IconTerminal,
  IconSettings,
  IconLogout,
  IconCopy,
} from "./Icons";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { splitLocale } from "@/lib/i18n";
import { useLocalePath, useT } from "@/lib/i18n/provider";

/** Rutas SIN prefijo de idioma: el prefijo lo pone `useLocalePath` al pintar. */
const BASE = "/panel/seguro/dashboard";

const NAV = [
  { path: BASE, key: "channel", Icon: IconChat },
  { path: `${BASE}/contactos`, key: "contacts", Icon: IconUsers },
  { path: `${BASE}/vault`, key: "vault", Icon: IconKey },
  { path: `${BASE}/logs`, key: "transport", Icon: IconTerminal },
  { path: `${BASE}/settings`, key: "settings", Icon: IconSettings },
] as const;

const SessionCtx = createContext<Session | null>(null);

/** Identidad de la sesión actual. Solo válido dentro de <DashboardShell>. */
export function useDashboardSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("useDashboardSession fuera de DashboardShell");
  return s;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const href = useLocalePath();
  // La ruta que da Next lleva el prefijo de idioma (`/en/panel/...`); se quita para comparar
  // contra las rutas del menú, que se declaran sin él.
  const pathname = splitLocale(usePathname() ?? "/").path;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unread, setUnread] = useState(0);

  // Badge de no leídos: se recalcula al navegar y cuando el Canal emite `aegis:unread`.
  useEffect(() => {
    if (!session) return;
    const refresh = () => setUnread(unreadCount(session.publicKey));
    refresh();
    window.addEventListener("aegis:unread", refresh);
    return () => window.removeEventListener("aegis:unread", refresh);
  }, [session, pathname]);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace(href("/login"));
      return;
    }
    // El token persiste en localStorage, pero la semilla vive SOLO en memoria: al recargar la
    // página hay sesión pero el keystore está bloqueado y NO se puede firmar ni cifrar (enviar/
    // recibir fallaría). Volvemos a /login para re-desbloquear con la contraseña (como una
    // pantalla de bloqueo). Es coherente con el modelo de equipo compartido de identity-store.
    if (!isUnlocked()) {
      router.replace(href("/login"));
      return;
    }
    setSession(s);
    setFaviconSecure(s.secure); // el favicon refleja el estado real de la sesión
    setReady(true);
  }, [router, href]);

  async function lock() {
    // Revoca la sesión en el relay (best-effort) antes de limpiar la local.
    const token = getToken();
    if (token) {
      try {
        await logout(token);
      } catch {
        /* el relay puede estar caído; la sesión local se limpia igualmente */
      }
    }
    endSession();
    lockKeystore(); // borra la semilla descifrada de memoria: hay que re-desbloquear para volver
    router.push(href("/login"));
  }

  async function copyId() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible */
    }
  }

  if (!ready || !session) return null;

  const grouped = groupIdentity(session.id);

  return (
    <SessionCtx.Provider value={session}>
      <div className="h-screen flex flex-col overflow-hidden bg-bg text-text">
        <div className="fixed inset-0 grid-bg z-0 pointer-events-none opacity-60" />

        {/* Top bar */}
        <header className="relative z-20 h-14 shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-line bg-surface/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <LogoMark className="h-6 w-6" />
            <span className="font-mono font-semibold tracking-[0.14em] text-sm">
              USE AEGIS
            </span>
            <span className="hidden sm:block h-4 w-px bg-line" />
            <span
              className="hidden sm:inline-flex items-center gap-1.5 label"
              style={{ color: session.secure ? "#c3f400" : "#fbbf24" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: session.secure ? "#c3f400" : "#fbbf24",
                  boxShadow: session.secure ? "0 0 8px #c3f400" : undefined,
                }}
              />
              {session.secure ? t.shell.sessionVerified : t.shell.sessionUnprotected}
            </span>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-[11px] text-secondary truncate">{grouped}</span>
            <LocaleSwitcher className="shrink-0" />
          </div>
        </header>

        <div className="relative z-10 flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-line bg-surface/60 backdrop-blur-sm">
            <div className="p-4 border-b border-line">
              {session.secure ? (
                <>
                  <p className="label text-muted mb-1">{t.shell.secureSession}</p>
                  <p className="label text-accent">{t.shell.encryptionVerified}</p>
                </>
              ) : (
                <>
                  <p className="label text-muted mb-1">{t.shell.sessionUnprotected}</p>
                  <p className="label text-status-p2p">{t.shell.noAutoWipe}</p>
                </>
              )}
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {NAV.map(({ path, key, Icon }) => {
                const active = path === BASE ? pathname === BASE : pathname.startsWith(path);
                return (
                  <Link
                    key={path}
                    href={href(path)}
                    className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-sm text-sm transition-colors ${
                      active
                        ? "text-accent bg-accent/5 border-r-2 border-accent"
                        : "text-muted hover:text-text hover:bg-surface-2"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="label">{t.shell.nav[key]}</span>
                    {path === BASE && unread > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-bg text-[10px] font-bold flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-line">
              <p className="label text-muted-2 mb-2">{t.shell.yourIdentity}</p>
              <div className="bg-bg border border-line rounded-sm p-3">
                <p className="font-mono text-[12px] text-accent tracking-wide break-all leading-relaxed">
                  {grouped}
                </p>
                <button
                  onClick={copyId}
                  className="mt-2.5 inline-flex items-center gap-1.5 label text-muted-2 hover:text-text transition-colors"
                >
                  <IconCopy className="w-3.5 h-3.5" />
                  {copied ? t.common.copied : t.shell.copyId}
                </button>
              </div>
            </div>

            <div className="p-3 border-t border-line">
              <button
                onClick={lock}
                className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-sm text-error/90 hover:bg-error/10 transition-colors label"
              >
                <IconLogout className="w-4 h-4" />
                {t.shell.lockSession}
              </button>
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</main>
        </div>

        {/* Nav inferior móvil */}
        <nav className="md:hidden shrink-0 h-14 border-t border-line bg-surface/90 backdrop-blur-md flex items-center justify-around z-20">
          {NAV.map(({ path, key, Icon }) => {
            const active = path === BASE ? pathname === BASE : pathname.startsWith(path);
            return (
              <Link
                key={path}
                href={href(path)}
                className={`relative flex flex-col items-center gap-1 ${
                  active ? "text-accent" : "text-muted-2"
                }`}
              >
                <Icon className="w-5 h-5" />
                {path === BASE && unread > 0 && (
                  <span className="absolute -top-1 right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-accent text-bg text-[9px] font-bold flex items-center justify-center">
                    {unread}
                  </span>
                )}
                <span className="label text-[9px]">{t.shell.nav[key]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </SessionCtx.Provider>
  );
}
