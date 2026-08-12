import Link from "next/link";
import { LogoMark } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { getDictionary, localePath, type Locale } from "@/lib/i18n";

export function Nav({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const href = (path: string) => localePath(locale, path);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-bg/80 backdrop-blur-md border-b border-line">
      <nav className="max-w-shell mx-auto h-14 px-5 md:px-8 flex items-center justify-between">
        <Link href={href("/")} className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-6" />
          <span className="font-mono font-semibold tracking-[0.14em] text-sm text-text">
            AEGIS
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-7 label text-muted">
          <a className="hover:text-text transition-colors" href="#protege">
            {t.nav.howItProtects}
          </a>
          <a className="hover:text-text transition-colors" href="#transporte">
            {t.nav.transport}
          </a>
          <a className="hover:text-text transition-colors" href="#segura">
            {t.nav.torSession}
          </a>
          <a className="hover:text-text transition-colors" href="#limites">
            {t.nav.limits}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <a
            className="label text-muted hover:text-text transition-colors hidden sm:inline"
            href={href("/login")}
          >
            {t.nav.login}
          </a>
          <a
            className="label border border-line hover:border-accent-dim hover:text-text text-muted px-3 py-1.5 rounded-sm transition-colors"
            href={href("/register")}
          >
            {t.nav.createIdentity}
          </a>
        </div>
      </nav>
    </header>
  );
}
