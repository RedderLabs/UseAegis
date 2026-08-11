/**
 * Preset de Tailwind compartido para todas las apps de Aegis.
 * Tokens tomados de stitch-aegis/DESIGN.md ("Aegis Visual Identity" — Terminal Chic).
 * Fuente única de verdad para que ninguna app defina colores/fuentes ad-hoc.
 *
 * NOTA: estos valores difieren de docs/DISENO.md (paleta obsidian + Cyber Lime +
 * Signal Blue + tipografía dual Hanken/JetBrains, en vez de #0a0b0c + verde-fósforo
 * + IBM Plex Mono única). Prevalece DESIGN.md por decisión explícita.
 *
 * CommonJS a propósito: lo consume tailwind.config.ts, que se evalúa en Node.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Superficies (escalera "Midnight" obsidian, no negro puro)
        bg: "#131313",
        surface: "#201f1f",
        "surface-2": "#2a2a2a",
        line: "#353534",
        // Texto
        text: "#e5e2e1",
        muted: "#c4c9ac",
        "muted-2": "#8e9379",
        // Cyber Lime — acciones críticas, estado de cifrado, señal activa
        accent: "#c3f400",
        "accent-dim": "#abd600",
        // Signal Blue — info pasiva, enlaces secundarios, identidad verificada
        secondary: "#adc6ff",
        // Burbujas de mensaje
        "bubble-out": "#201f1f",
        "bubble-in": "#1c1b1b",
        // Estado
        error: "#ffb4ab",
        // Estado de transporte (relay = Cyber Lime; ámbar/naranja para P2P/Mesh)
        "status-relay": "#c3f400",
        "status-p2p": "#fbbf24",
        "status-mesh": "#ea580c",
        // Sin ruta: no es un modo, es la ausencia de todos ellos
        "status-offline": "#ffb4ab",
      },
      fontFamily: {
        // Hanken Grotesk (humano) + JetBrains Mono (técnico). Las vars las inyecta
        // next/font desde apps/web/app/layout.tsx.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        sm: "0.125rem",
        md: "0.5rem",
        lg: "0.75rem",
      },
      maxWidth: {
        shell: "1120px",
      },
    },
  },
};
