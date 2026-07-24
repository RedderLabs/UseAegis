import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Sistema tipográfico dual (stitch-aegis/DESIGN.md §Typography), self-hosteado de verdad con
// `next/font/local`: los .woff2 (variables, subset latin, OFL) viven en el repo (./fonts) y se
// sirven desde la propia app. NO se usa `next/font/google` a propósito: aquél descarga las
// fuentes de Google EN BUILD-TIME, lo que rompe el build en servidores sin DNS/egress a Google
// (p. ej. el nodo self-hosted) y contradice el "sin CDN de fuentes". Con los ficheros locales el
// build es hermético (offline) y no depende de Google en ningún momento.
//  - Hanken Grotesk → comunicación humana (titulares, cuerpo)  · eje wght 100–900
//  - JetBrains Mono  → verificación técnica (claves, logs, labels de sistema) · eje wght 100–800
const sans = localFont({
  src: "./fonts/hanken-grotesk-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
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
