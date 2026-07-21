import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Sistema tipográfico dual (stitch-aegis/DESIGN.md §Typography), self-hosteado por
// next/font (sin CDN de fuentes en producción):
//  - Hanken Grotesk → comunicación humana (titulares, cuerpo)
//  - JetBrains Mono  → verificación técnica (claves, logs, labels de sistema)
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

// URL pública clearnet: base para canonical, sitemap y previews Open Graph.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://useaegis.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Aegis — El servidor solo transporta ruido",
  description:
    "Mensajería cifrada extremo a extremo, de código abierto y auditable. La alternativa a WhatsApp y Telegram: sin perfiles, sin telemetría, sin cuentas. El servidor solo transporta ruido.",
  keywords: [
    // Posicionamiento: alternativa auditable frente a apps cerradas.
    "mensajería cifrada",
    "cifrado de extremo a extremo",
    "código abierto",
    "auditable",
    "alternativa a WhatsApp",
    "alternativa a Telegram",
    "alternativa a apps de código cerrado",
    "mensajería privada",
    "mensajería de código abierto",
    "sin metadatos",
    "sin telemetría",
    "privacidad",
    "comunicación segura",
    "Tor",
    ".onion",
    "encrypted messaging",
    "end-to-end encryption",
    "open source messenger",
    "auditable messaging",
    "WhatsApp alternative",
    "Telegram alternative",
    "use aegis app",
    "aegis app",
    "use aegis",
    "useaegis",
    "useaegis.app",
  ],
  // Directriz de indexación a nivel de sitio (el panel se excluye además en robots.ts).
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: SITE_URL,
    siteName: "Aegis",
    title: "Aegis — El servidor solo transporta ruido",
    description:
      "Mensajería cifrada extremo a extremo, de código abierto y auditable. Sin perfiles, sin telemetría, sin cuentas.",
    // NOTA: SVG no lo renderizan WhatsApp/Twitter/Facebook en las previews.
    // Sustituir por un PNG/JPG de 1200×630 cuando esté disponible.
    images: [{ url: "/Aegis.svg", width: 1200, height: 630, alt: "Aegis" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aegis — El servidor solo transporta ruido",
    description:
      "Mensajería cifrada extremo a extremo, de código abierto y auditable. Sin perfiles, sin telemetría, sin cuentas.",
    images: ["/Aegis.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
