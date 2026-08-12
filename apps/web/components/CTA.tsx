import { getDictionary, localePath, type Locale } from "@/lib/i18n";

export function CTA({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);

  return (
    <section className="max-w-shell mx-auto px-5 md:px-8 py-28 text-center">
      <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-text max-w-2xl mx-auto leading-tight">
        {t.cta.title}
      </h2>
      <p className="mt-4 text-[15px] text-muted max-w-xl mx-auto">{t.cta.body}</p>
      <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
        <a
          className="inline-flex items-center justify-center gap-2 bg-accent text-bg font-mono font-semibold text-[13px] px-6 py-3.5 rounded-sm hover:brightness-110 transition"
          href={localePath(locale, "/register")}
        >
          {t.cta.primary}
        </a>
        <a
          className="inline-flex items-center justify-center gap-2 border border-line text-text font-mono text-[13px] px-6 py-3.5 rounded-sm hover:border-muted transition-colors"
          href={localePath(locale, "/login")}
        >
          {t.cta.secondary}
        </a>
      </div>
    </section>
  );
}
