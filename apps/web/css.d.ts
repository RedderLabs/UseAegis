// Declaración ambiental para importar hojas de estilo como side-effect (p.ej. `import "./globals.css"`).
// Next.js maneja el CSS en el bundle, pero TypeScript con moduleResolution "bundler" y
// `noUncheckedSideEffectImports` (activado por defecto en editores con TS ≥5.6) exige una declaración
// de módulo para el import, o lanza TS2882. Esto la aporta (módulo sin tipos, solo por su efecto).
declare module "*.css";
