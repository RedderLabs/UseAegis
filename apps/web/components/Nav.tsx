import Link from "next/link";
import { LogoMark } from "./Logo";

export function Nav() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-bg/80 backdrop-blur-md border-b border-line">
      <nav className="max-w-shell mx-auto h-14 px-5 md:px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-6" />
          <span className="font-mono font-semibold tracking-[0.14em] text-sm text-text">
            AEGIS
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-7 label text-muted">
          <a className="hover:text-text transition-colors" href="#protege">
            Cómo protege
          </a>
          <a className="hover:text-text transition-colors" href="#transporte">
            Transporte
          </a>
          <a className="hover:text-text transition-colors" href="#segura">
            Sesión por Tor
          </a>
          <a className="hover:text-text transition-colors" href="#limites">
            Qué no protege
          </a>
        </div>
        <div className="flex items-center gap-3">
          <a
            className="label text-muted hover:text-text transition-colors hidden sm:inline"
            href="/login"
          >
            Entrar
          </a>
          <a
            className="label border border-line hover:border-accent-dim hover:text-text text-muted px-3 py-1.5 rounded-sm transition-colors"
            href="/register"
          >
            Crear identidad
          </a>
        </div>
      </nav>
    </header>
  );
}
