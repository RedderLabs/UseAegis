import { getDictionary, type Locale } from "@/lib/i18n";

export function Handshake({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);

  return (
    <section className="max-w-shell mx-auto px-5 md:px-8 py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="label text-accent-dim mb-3">{t.handshake.eyebrow}</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            {t.handshake.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{t.handshake.body1}</p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            {t.handshake.body2Start}
            <span className="text-text">{t.handshake.body2Status}</span>.
          </p>
        </div>
        <div className="bg-surface border border-line rounded-md p-4 font-mono text-[13px]">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-line">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-2" />
            <span className="w-2.5 h-2.5 rounded-full bg-muted-2" />
            <span className="w-2.5 h-2.5 rounded-full bg-accent-dim" />
            <span className="ml-2 label text-muted-2">{t.handshake.terminal.command}</span>
          </div>
          <div className="space-y-1.5 text-muted leading-relaxed">
            <p>
              <span className="text-accent-dim">[KEX ]</span> {t.handshake.terminal.kex}
            </p>
            <p>
              <span className="text-accent-dim">[AEAD]</span> {t.handshake.terminal.aead}
            </p>
            <p>
              <span className="text-accent-dim">[ID&nbsp;&nbsp;]</span> {t.handshake.terminal.id}
            </p>
            <p>
              <span className="text-accent-dim">[SEAL]</span> {t.handshake.terminal.seal}
            </p>
            <p className="text-accent">{t.handshake.terminal.active}</p>
            <p className="text-muted-2">{t.handshake.terminal.oob}</p>
            <p className="caret text-muted" />
          </div>
        </div>
      </div>
    </section>
  );
}
