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
    title: t.metadata.privacy.title,
    description: t.metadata.privacy.description,
    alternates: alternatesFor(locale, "/privacidad"),
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

export default async function PrivacidadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = getDictionary(locale).privacy;

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
          <p className="mt-3 text-[15px] text-muted">
            {t.introStart}
            <a
              className="text-accent-dim hover:text-text transition-colors"
              href={`${REPO}/blob/main/docs/THREAT_MODEL.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.introLink}
            </a>
            {t.introEnd}
          </p>

          <div className="mt-6 mb-12 border border-line rounded-md bg-surface px-4 py-3">
            <p className="label text-muted-2">{t.draft}</p>
          </div>

          <Section title={t.cannotSee.title}>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-text">{t.cannotSee.contentLead}</span>{" "}
                {t.cannotSee.contentBody}
              </li>
              <li>
                <span className="text-text">{t.cannotSee.senderLead}</span> {t.cannotSee.senderBody}
              </li>
              <li>
                <span className="text-text">{t.cannotSee.identityLead}</span>{" "}
                {t.cannotSee.identityBody}
              </li>
              <li>
                <span className="text-text">{t.cannotSee.attachmentsLead}</span>{" "}
                {t.cannotSee.attachmentsBody}
              </li>
            </ul>
          </Section>

          <Section title={t.canSee.title}>
            <p>{t.canSee.intro}</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-text">{t.canSee.metadataLead}</span>
                {t.canSee.metadataBodyStart}
                <span className="font-mono text-[12px]">.onion</span>
                {t.canSee.metadataBodyEnd}
              </li>
              <li>
                <span className="text-text">{t.canSee.timingLead}</span>
                {t.canSee.timingBody}
              </li>
              <li>
                <span className="text-text">{t.canSee.mailboxLead}</span>
                {t.canSee.mailboxBody}
              </li>
            </ul>
          </Section>

          <Section title={t.retention.title}>
            <p>{t.retention.body}</p>
          </Section>

          <Section title={t.analytics.title}>
            <p>{t.analytics.body}</p>
          </Section>

          <Section title={t.noBackdoor.title}>
            <p>{t.noBackdoor.body}</p>
          </Section>

          <Section title={t.contact.title}>
            <p>
              {t.contact.bodyStart}
              <a
                className="text-accent-dim hover:text-text transition-colors"
                href={`${REPO}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.contact.disclosureLink}
              </a>
              {t.contact.bodyMiddle}
              <a
                className="text-accent-dim hover:text-text transition-colors"
                href={`${REPO}/issues`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.contact.issueLink}
              </a>
              {t.contact.bodyEnd}
            </p>
          </Section>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
