import Script from "next/script";

/**
 * Analítica Umami — SOLO en la landing (app/page.tsx). No se monta en la app (login,
 * register, panel), por eso NO vive en app/layout.tsx sino que se incluye a mano en la
 * página de inicio.
 *
 * Umami es sin cookies y sin datos personales (agrega, no perfila), así que no contradice
 * el "sin telemetría" del producto — esa promesa es sobre la mensajería, no sobre la web
 * de marketing.
 *
 * Se activa solo si AMBAS variables están definidas. Sin configurar (dev, o hasta desplegar
 * la instancia de Umami) devuelve null: no carga ningún script, cero red. Ambas son
 * NEXT_PUBLIC_ → se inlinean en el bundle del cliente.
 */
export function UmamiAnalytics() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return null;

  return (
    <Script
      src={src}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
