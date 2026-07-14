import { StatusDot } from "./StatusDot";
import { LogoMark } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <LogoMark className="h-6 w-6" />
              <span className="font-mono font-semibold tracking-[0.14em] text-sm text-text">
                AEGIS
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              Una función, sin desvíos: mensajes cifrados que llegan. El servidor
              solo transporta ruido.
            </p>
          </div>
          <div>
            <p className="label text-muted mb-4">Proyecto</p>
            <ul className="space-y-2.5 text-[13px] text-muted">
              <li>
                <a className="hover:text-text transition-colors" href="#">
                  Código fuente
                </a>
              </li>
              <li>
                <a className="hover:text-text transition-colors" href="#">
                  Modelo de amenaza
                </a>
              </li>
              <li>
                <a className="hover:text-text transition-colors" href="#">
                  Reproducible builds
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="label text-muted mb-4">Comunidad</p>
            <ul className="space-y-2.5 text-[13px] text-muted">
              <li>
                <a className="hover:text-text transition-colors" href="#">
                  Contribuir
                </a>
              </li>
              <li>
                <a className="hover:text-text transition-colors" href="#">
                  Anuncios
                </a>
              </li>
              <li>
                <a className="hover:text-text transition-colors" href="#">
                  Reportar un fallo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="label text-muted mb-4">Estado</p>
            <div className="inline-flex items-center gap-2 border border-line rounded-sm px-3 py-2">
              <StatusDot className="w-1.5 h-1.5" />
              <span className="label text-accent">Relay operativo</span>
            </div>
            <p className="mt-3 label text-muted-2">Auditoría externa: pendiente</p>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-line flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="label text-muted-2">
            © 2026 Redder Labs · Código abierto y auditable
          </p>
          <div className="flex gap-6 label text-muted-2">
            <a className="hover:text-muted transition-colors" href="#">
              Privacidad
            </a>
            <a className="hover:text-muted transition-colors" href="#">
              Términos
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
