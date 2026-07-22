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

export default function Home() {
  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <Nav />
      <main className="relative z-10 pt-14">
        <Hero />
        <div className="max-w-shell mx-auto px-5 md:px-8">
          <div className="h-px hairline-accent" />
        </div>
        <Protects />
        <Transports />
        <SecureSession />
        <Handshake />
        <Limits />
        <CTA />
      </main>
      <Footer />
      {/* Momento de bienvenida: popup opcional que enseña el viaje del mensaje (solo landing). */}
      <MessageJourney />
      {/* Analítica solo de la landing (no en la app). No-op si no está configurada. */}
      <UmamiAnalytics />
    </>
  );
}
