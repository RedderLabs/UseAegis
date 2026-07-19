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

export const metadata: Metadata = {
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
  ],
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
