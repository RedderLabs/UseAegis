import { getDictionary, type Locale } from "@/lib/i18n";

const LIMITS = ["metadata", "timing", "device", "coercion"] as const;

export function Limits({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);

  return (
    <section id="limites" className="bg-surface border-y border-line">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-24">
        <div className="mb-12 max-w-2xl">
          <p className="label text-accent-dim mb-3">{t.limits.eyebrow}</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            {t.limits.title}
          </h2>
          <p className="mt-3 text-[15px] text-muted">{t.limits.body}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LIMITS.map((key) => (
            <div key={key} className="border border-line rounded-md p-6 bg-bg">
              <h3 className="text-text text-[15px] mb-2">{t.limits.items[key].title}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{t.limits.items[key].body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 label text-muted-2">{t.limits.footnote}</p>
      </div>
    </section>
  );
}
