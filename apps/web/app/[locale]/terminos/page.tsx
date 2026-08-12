import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DEFAULT_LOCALE, getDictionary, isLocale } from "@/lib/i18n";
import { alternatesFor } from "@/lib/i18n/metadata";

const REPO = "https://github.com/RedderLabs/UseAegis";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale);
  return {
    title: t.metadata.terms.title,
    description: t.metadata.terms.description,
    alternates: alternatesFor(locale, "/terminos"),
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg md:text-xl font-semibold tracking-tight text-text mb-3">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default async function TerminosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = getDictionary(locale).terms;

  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <Nav locale={locale} />
      <main className="relative z-10 pt-14">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-16 md:py-24">
          <p className="label text-accent-dim mb-3">{t.eyebrow}</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            {t.title}
          </h1>
          <p className="mt-3 text-[15px] text-muted">{t.intro}</p>

          <div className="mt-6 mb-12 border border-line rounded-md bg-surface px-4 py-3">
            <p className="label text-muted-2">{t.draft}</p>
          </div>

          <Section title={t.foss.title}>
            <p>
              {t.foss.bodyStart}
              <a
                className="text-accent-dim hover:text-text transition-colors"
                href={`${REPO}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.foss.link}
              </a>
              {t.foss.bodyEnd}
            </p>
          </Section>

          <Section title={t.noWarranty.title}>
            <p>{t.noWarranty.body}</p>
          </Section>

          <Section title={t.bestEffort.title}>
            <p>{t.bestEffort.body}</p>
          </Section>

          <Section title={t.identity.title}>
            <p>{t.identity.body}</p>
          </Section>

          <Section title={t.acceptableUse.title}>
            <p>{t.acceptableUse.body}</p>
          </Section>

          <Section title={t.changes.title}>
            <p>{t.changes.body}</p>
          </Section>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
