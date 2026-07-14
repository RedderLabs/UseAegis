import type { Config } from "tailwindcss";
import preset from "@aegis/ui-kit/tailwind-preset";

const config: Config = {
  darkMode: "class",
  presets: [preset as Partial<Config>],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
};

export default config;
