import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacidad · Aegis",
  description:
    "Qué ve y qué no ve Aegis. Cifrado de extremo a extremo, remitente oculto y sin datos personales.",
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

export default function PrivacidadPage() {
  return (
    <>
      <div className="fixed inset-0 grid-bg z-0 pointer-events-none" />
      <Nav />
      <main className="relative z-10 pt-14">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-16 md:py-24">
          <p className="label text-accent-dim mb-3">Privacidad</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            Qué ve y qué no ve Aegis
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            La privacidad no es una promesa de marketing: es lo que el diseño técnico permite
            y lo que no. Aquí está sin letra pequeña. El detalle formal está en el{" "}
            <a
              className="text-accent-dim hover:text-text transition-colors"
              href={`${REPO}/blob/main/docs/THREAT_MODEL.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              modelo de amenaza
            </a>
            .
          </p>

          <div className="mt-6 mb-12 border border-line rounded-md bg-surface px-4 py-3">
            <p className="label text-muted-2">
              Borrador honesto — describe el comportamiento real del software, no un texto legal
              cerrado. Se endurecerá con revisión antes de una versión pública definitiva.
            </p>
          </div>

          <Section title="Lo que el servidor NO puede ver">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-text">El contenido de tus mensajes.</span> Se cifran de
                extremo a extremo en tu dispositivo (XChaCha20-Poly1305); el servidor solo
                almacena un bloque opaco. Nadie en el servidor puede leerlos.
              </li>
              <li>
                <span className="text-text">Quién te escribe (remitente oculto).</span> El buzón
                no guarda el remitente: su identidad viaja cifrada dentro del propio mensaje
                («sealed sender»).
              </li>
              <li>
                <span className="text-text">Tu identidad personal.</span> No pedimos correo,
                teléfono ni nombre real. Tu identidad es una clave criptográfica generada en tu
                dispositivo. Tu clave privada nunca sale de él, salvo que tú exportes tu código de
                recuperación.
              </li>
              <li>
                <span className="text-text">Los adjuntos.</span> Archivos y notas de voz se
                cifran con una clave propia por adjunto antes de subirse; el almacenamiento solo
                ve datos cifrados, nunca el nombre, el tipo ni el contenido.
              </li>
            </ul>
          </Section>

          <Section title="Lo que el servidor SÍ ve (y por qué)">
            <p>
              Ser honestos sobre los límites importa tanto como cifrar. Con la conexión normal, el
              operador del servidor puede observar:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-text">Metadatos de conexión:</span> tu IP y el momento en
                que te conectas. Se elimina usando la conexión protegida por Tor (la app la ofrece
                como su propia dirección <span className="font-mono text-[12px]">.onion</span>).
              </li>
              <li>
                <span className="text-text">Tamaño y momento de los mensajes:</span> un observador
                puede inferir que hay conversación y cuánto se envía, nunca el contenido. La app v1
                no rellena el tamaño (padding).
              </li>
              <li>
                <span className="text-text">A qué buzón se entrega en el instante del envío:</span>{" "}
                el envío va autenticado (anti-spam), así que el servidor podría correlacionar en ese
                momento. La conexión por Tor lo mitiga; los tokens ciegos son endurecimiento futuro.
              </li>
            </ul>
          </Section>

          <Section title="Retención">
            <p>
              Los mensajes cifrados se retienen un tiempo limitado (por defecto ~30 días) para que
              puedas retomar la conversación al cambiar de dispositivo o de puerta (conexión normal
              ↔ Tor), y luego se borran automáticamente. Los adjuntos siguen la misma caducidad. No
              hay copias adicionales para nosotros: no podemos leer lo que se retiene.
            </p>
          </Section>

          <Section title="Analítica y terceros">
            <p>
              La app de mensajería no lleva ninguna analítica ni telemetría. La web pública de
              presentación puede usar Umami (analítica auto-hospedada, sin cookies y sin perfilado
              individual); si no está configurada, no se carga ningún script. No vendemos datos ni
              incluimos rastreadores de terceros.
            </p>
          </Section>

          <Section title="Sin puerta trasera">
            <p>
              No hay forma de que recuperemos tu cuenta ni tus mensajes por ti: no tenemos tus
              claves. Si pierdes tu código de recuperación, nadie —tampoco nosotros— puede acceder
              a tu identidad. Es el precio de que nadie más pueda tampoco.
            </p>
          </Section>

          <Section title="Contacto">
            <p>
              Dudas de privacidad o un problema de seguridad: usa el{" "}
              <a
                className="text-accent-dim hover:text-text transition-colors"
                href={`${REPO}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                proceso de divulgación
              </a>{" "}
              o abre una{" "}
              <a
                className="text-accent-dim hover:text-text transition-colors"
                href={`${REPO}/issues`}
                target="_blank"
                rel="noopener noreferrer"
              >
                incidencia en el repositorio
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
