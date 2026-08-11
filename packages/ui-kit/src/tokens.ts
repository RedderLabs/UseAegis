/**
 * Design tokens de Aegis — fuente única de verdad.
 * Tomados de stitch-aegis/DESIGN.md ("Aegis Visual Identity" — Terminal Chic).
 * El preset de Tailwind (tailwind-preset.cjs) usa estos mismos valores.
 *
 * NOTA: difieren de docs/DISENO.md (obsidian + Cyber Lime + Signal Blue + tipografía
 * dual, en vez de #0a0b0c + verde-fósforo + IBM Plex Mono única). Prevalece DESIGN.md.
 */

export const colors = {
  /** Fondo base (obsidian "Midnight", no negro puro) */
  bg: "#131313",
  /** Contenedores / tarjetas */
  surface: "#201f1f",
  /** Elementos elevados (inputs, fingerprint bar) */
  "surface-2": "#2a2a2a",
  /** Bordes, divisores */
  line: "#353534",
  /** Texto principal */
  text: "#e5e2e1",
  /** Texto secundario */
  muted: "#c4c9ac",
  /** Texto terciario / dim */
  "muted-2": "#8e9379",
  /** Cyber Lime — acciones críticas, estado de cifrado, señal activa */
  accent: "#c3f400",
  /** Lime atenuado — labels, prefijos de log, estados en reposo */
  "accent-dim": "#abd600",
  /** Signal Blue — info pasiva, enlaces secundarios, identidad verificada */
  secondary: "#adc6ff",
  /** Burbuja de mensaje propio (borde lime aplicado por componente) */
  "bubble-out": "#201f1f",
  /** Burbuja de mensaje recibido */
  "bubble-in": "#1c1b1b",
  /** Error */
  error: "#ffb4ab",
} as const;

/**
 * Punto de estado de transporte (DISENO.md §6). Los tres primeros son MODOS; `offline` no es un
 * modo, es la ausencia de ruta — se pinta con el rojo de error para que no se confunda con el
 * naranja del mesh (que sí es una ruta viva, solo que local).
 */
export const transportStatus = {
  relay: colors.accent, // Cyber Lime: relay activo, baja latencia
  p2p: "#fbbf24", // ámbar: modo P2P (libp2p), sin relay central
  mesh: "#ea580c", // rojo/naranja apagado: mesh local (BLE/Wi-Fi Aware)
  offline: colors.error, // sin ruta: ningún modo alcanzable ahora mismo
} as const;

export const fontFamily = {
  /** Comunicación humana: titulares y cuerpo */
  sans: ['"Hanken Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
  /** Verificación técnica: claves, logs, labels de sistema */
  mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
} as const;

export const radius = {
  sm: "0.125rem",
  DEFAULT: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
} as const;

export const tokens = { colors, transportStatus, fontFamily, radius } as const;
export type Tokens = typeof tokens;
