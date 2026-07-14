# @aegis/ui-kit

## Qué hace
Fuente única de los design tokens de Aegis (colores, tipografía, radios) definidos
en `docs/DISENO.md §3`, expuestos como preset de Tailwind y como objeto TS.

## Qué NO hace
No contiene componentes React todavía. No aplica estilos por sí solo — solo provee
tokens. Las apps deciden cómo usarlos.

## Uso

```ts
// tailwind.config.ts de una app
import preset from "@aegis/ui-kit/tailwind-preset";
export default { presets: [preset], content: [...] };
```

```ts
// consumo directo de tokens en código
import { colors, transportStatus } from "@aegis/ui-kit/tokens";
```

## Modelo de amenaza relevante
Ninguno directo (no toca datos de usuario ni cripto). Su única "amenaza" es la
divergencia visual: si un color se define fuera de aquí, se rompe la garantía de
que el accent verde solo señala estado criptográfico verificado.

## Dependencias externas
Ninguna en runtime. `tailwindcss` es peer de las apps que consumen el preset.
