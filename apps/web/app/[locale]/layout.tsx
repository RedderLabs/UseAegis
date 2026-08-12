import type { Metadata } from "next";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import "../globals.css";
import {
  HTML_LANG,
  LOCALES,
  OG_LOCALE,
  getDictionary,
  isLocale,
  localePath,
} from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { SITE_URL, alternatesFor } from "@/lib/i18n/metadata";

// Sistema tipográfico dual (stitch-aegis/DESIGN.md §Typography), self-hosteado de verdad con
// `next/font/local`: los .woff2 (variables, subset latin, OFL) viven en el repo (../fonts) y se
// sirven desde la propia app. NO se usa `next/font/google` a propósito: aquél descarga las
// fuentes de Google EN BUILD-TIME, lo que rompe el build en servidores sin DNS/egress a Google
// (p. ej. el nodo self-hosted) y contradice el "sin CDN de fuentes". Con los ficheros locales el
// build es hermético (offline) y no depende de Google en ningún momento.
//  - Hanken Grotesk → comunicación humana (titulares, cuerpo)  · eje wght 100–900
//  - JetBrains Mono  → verificación técnica (claves, logs, labels de sistema) · eje wght 100–800
const sans = localFont({
  src: "../fonts/hanken-grotesk-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const mono = localFont({
  src: "../fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-mono",
  display: "swap",
});

/** Prerrenderiza las dos puertas de idioma: `/` (es, sin prefijo) y `/en`. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale);
  return {
    metadataBase: new URL(SITE_URL),
    alternates: alternatesFor(locale, "/"),
    title: t.metadata.home.title,
    description: t.metadata.home.description,
    keywords: t.metadata.keywords,
    // Directriz de indexación a nivel de sitio (el panel se excluye además en robots.ts).
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[isLocale(locale) ? locale : "es"],
      url: `${SITE_URL}${localePath(isLocale(locale) ? locale : "es", "/")}`,
      siteName: "Aegis",
      title: t.metadata.home.title,
      description: t.metadata.home.ogDescription,
      // NOTA: SVG no lo renderizan WhatsApp/Twitter/Facebook en las previews.
      // Sustituir por un PNG/JPG de 1200×630 cuando esté disponible.
      images: [{ url: "/Aegis.svg", width: 1200, height: 630, alt: "Aegis" }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.metadata.home.title,
      description: t.metadata.home.ogDescription,
      images: ["/Aegis.svg"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // El middleware solo deja pasar idiomas soportados, pero una petición directa a `/fr/...`
  // llegaría hasta aquí: 404 en vez de servir castellano bajo una URL que promete otra cosa.
  if (!isLocale(locale)) notFound();

  return (
    <html lang={HTML_LANG[locale]} className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans bg-bg text-text antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
