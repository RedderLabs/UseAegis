import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Términos · Aegis",
  description:
    "Condiciones de uso de Aegis: software libre, sin garantías, y tu identidad bajo tu control.",
};

const REPO = "https://github.com/RedderLabs/Aegis";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg md:text-xl font-semibold tracking-tight text-text mb-3">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function TerminosPage() {
  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <Nav />
      <main className="relative z-10 pt-14">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-16 md:py-24">
          <p className="label text-accent-dim mb-3">Términos</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            Condiciones de uso
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            Aegis es software libre y un servicio best-effort. Estas condiciones dicen qué puedes
            esperar de él y qué no. En resumen: tu identidad es tuya, y el código es auditable.
          </p>

          <div className="mt-6 mb-12 border border-line rounded-md bg-surface px-4 py-3">
            <p className="label text-muted-2">
              Borrador honesto — no sustituye a un texto legal revisado. Se endurecerá antes de una
              versión pública definitiva.
            </p>
          </div>

          <Section title="Software libre">
            <p>
              El código de Aegis es abierto y auditable, publicado bajo la licencia del{" "}
              <a
                className="text-accent-dim hover:text-text transition-colors"
                href={`${REPO}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
              >
                repositorio
              </a>
              . Puedes leerlo, verificarlo, ejecutarlo por tu cuenta y contribuir. No tienes que
              confiar en nuestra palabra: puedes comprobarlo.
            </p>
          </Section>

          <Section title="Sin garantías">
            <p>
              El software y el servicio se ofrecen «tal cual», sin garantías de ningún tipo. Aunque
              ponemos cuidado en la criptografía y la seguridad, no garantizamos que el servicio
              esté siempre disponible ni libre de errores. No respondemos por daños derivados del
              uso, en la medida que permita la ley.
            </p>
          </Section>

          <Section title="Servicio best-effort">
            <p>
              El relay público es un servicio de mejor esfuerzo, sin acuerdo de nivel de servicio
              (SLA): puede caerse, reiniciarse o cambiar. Como el código es abierto, cualquiera
              puede alojar su propio relay si necesita garantías propias.
            </p>
          </Section>

          <Section title="Tu identidad y tus claves">
            <p>
              Tu identidad y tus claves se generan y viven en tu dispositivo. Eres responsable de
              custodiar tu contraseña y tu código de recuperación: no tenemos copia y no podemos
              recuperarlos por ti. No hay puerta trasera —ni para nosotros—. Perder el código de
              recuperación significa perder el acceso a esa identidad.
            </p>
          </Section>

          <Section title="Uso aceptable">
            <p>
              Aegis protege la privacidad de tus comunicaciones; su uso responsable es cosa tuya.
              No lo utilices para actividades ilegales ni para dañar a terceros. La herramienta
              protege datos, no ampara conductas.
            </p>
          </Section>

          <Section title="Cambios">
            <p>
              Estas condiciones pueden actualizarse a medida que el proyecto madura. Los cambios
              relevantes se reflejarán aquí y en el historial del repositorio, que es público.
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
