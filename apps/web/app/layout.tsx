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
    "Mensajería cifrada extremo a extremo. Una sola función: enviar un mensaje cifrado que llegue. Sin perfiles, sin telemetría, sin cuentas.",
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
