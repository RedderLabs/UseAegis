import Link from "next/link";
import { StatusDot } from "./StatusDot";
import { LogoMark } from "./Logo";
import { JourneyTrigger } from "./MessageJourney";

const REPO = "https://github.com/RedderLabs/Aegis";
const BLOB = `${REPO}/blob/main`;
// Panel PÚBLICO de analítica (Umami, sin cookies): transparencia total, cualquiera ve las visitas.
const STATS_URL = "https://stats.useaegis.app/share/sDFD9RSBa4h54r1P";
// Puerta del servicio oculto: visible para quien navega con Tor. Reusa la env var del despliegue.
const WEB_ONION = process.env.NEXT_PUBLIC_WEB_ONION_URL;

/** Enlace externo (abre en pestaña nueva, con rel de seguridad). */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="hover:text-text transition-colors"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

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
                <Ext href={REPO}>Código fuente</Ext>
              </li>
              <li>
                <Ext href={`${BLOB}/docs/THREAT_MODEL.md`}>Modelo de amenaza</Ext>
              </li>
              <li>
                <Ext href={`${BLOB}/docs/ROADMAP.md`}>Reproducible builds</Ext>
              </li>
            </ul>
          </div>
          <div>
            <p className="label text-muted mb-4">Comunidad</p>
            <ul className="space-y-2.5 text-[13px] text-muted">
              <li>
                <Ext href={`${REPO}/blob/main/README.md`}>Contribuir</Ext>
              </li>
              <li>
                <Ext href={`${REPO}/releases`}>Anuncios</Ext>
              </li>
              <li>
                <Ext href={`${REPO}/issues`}>Reportar un fallo</Ext>
              </li>
              <li>
                <Ext href={`${BLOB}/SECURITY.md`}>Seguridad (divulgación)</Ext>
              </li>
            </ul>
          </div>
          <div>
            <p className="label text-muted mb-4">Estado</p>
            <div className="inline-flex items-center gap-2 border border-line rounded-sm px-3 py-2">
              <StatusDot className="w-1.5 h-1.5" />
              <span className="label text-accent">Relay operativo</span>
            </div>
            <a
              href={STATS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex w-fit items-center gap-2 border border-line rounded-sm px-3 py-2 label text-muted hover:text-text hover:border-accent transition-colors"
            >
              Estadísticas públicas →
            </a>
            <p className="mt-3 label text-muted-2">Auditoría externa: pendiente</p>
          </div>
        </div>
        {WEB_ONION && (
          <div className="mt-12 pt-6 border-t border-line">
            <p className="label text-muted mb-2">Servicio oculto (Tor)</p>
            <a
              href={`http://${WEB_ONION}`}
              className="font-mono text-[12px] break-all text-muted hover:text-accent transition-colors"
              title="Abrir en Tor Browser"
            >
              {WEB_ONION}
            </a>
          </div>
        )}
        <div className="mt-12 pt-6 border-t border-line flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="label text-muted-2">
            © 2026 Redder Labs · Código abierto y auditable
          </p>
          <div className="flex gap-6 label text-muted-2">
            <JourneyTrigger />
            <Link className="hover:text-muted transition-colors" href="/privacidad">
              Privacidad
            </Link>
            <Link className="hover:text-muted transition-colors" href="/terminos">
              Términos
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
