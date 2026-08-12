import { IMPLEMENTED_MODES } from "@aegis/transport";

import { StatusDot } from "./StatusDot";
import { getDictionary, type Locale } from "@/lib/i18n";

/** Un modo "brilla" solo si tiene red real y validada detrás (fuente única: `IMPLEMENTED_MODES`). */
const isLive = (mode: string): boolean =>
  (IMPLEMENTED_MODES as readonly string[]).includes(mode);

const MODES = ["relay", "p2p", "mesh"] as const;

export function Transports({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);

  return (
    <section id="transporte" className="bg-surface border-y border-line">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-24">
        <div className="mb-12">
          <p className="label text-accent-dim mb-3">{t.transports.eyebrow}</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            {t.transports.title}
          </h2>
          <p className="mt-3 text-[15px] text-muted max-w-2xl">{t.transports.body}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODES.map((mode) => (
            <div key={mode} className="bg-bg border border-line rounded-md p-6">
              <div className="flex items-center gap-2 mb-4">
                <StatusDot mode={mode} glow={isLive(mode)} />
                <span className="label text-text">{t.transports[mode].name}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted">{t.transports[mode].body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
