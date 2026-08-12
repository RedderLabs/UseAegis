import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Protects } from "@/components/Protects";
import { Transports } from "@/components/Transports";
import { SecureSession } from "@/components/SecureSession";
import { Handshake } from "@/components/Handshake";
import { Limits } from "@/components/Limits";
import { CTA } from "@/components/CTA";
import { Footer } from "@/components/Footer";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import { MessageJourney } from "@/components/MessageJourney";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <Nav locale={locale} />
      <main className="relative z-10 pt-14">
        <Hero locale={locale} />
        <div className="max-w-shell mx-auto px-5 md:px-8">
          <div className="h-px hairline-accent" />
        </div>
        <Protects locale={locale} />
        <Transports locale={locale} />
        <SecureSession />
        <Handshake locale={locale} />
        <Limits locale={locale} />
        <CTA locale={locale} />
      </main>
      <Footer locale={locale} />
      {/* Momento de bienvenida: popup opcional que enseña el viaje del mensaje (solo landing). */}
      <MessageJourney />
      {/* Analítica solo de la landing (no en la app). No-op si no está configurada. */}
      <UmamiAnalytics />
    </>
  );
}
