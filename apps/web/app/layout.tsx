/**
 * Layout raíz de PASO: no pinta nada. Todas las páginas viven bajo `app/[locale]/`, y es ese
 * layout el que emite `<html>`/`<body>` — porque `lang` depende del idioma y aquí todavía no se
 * conoce el segmento. Next exige que exista un layout raíz, así que este se limita a dejar pasar
 * a sus hijos.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
