import type es from "./dictionaries/es";

/**
 * Forma de un diccionario de idioma. Se deriva del ESPAÑOL, que es la fuente de verdad: añadir
 * una clave allí rompe la compilación de cualquier idioma que no la tenga (ver `en.ts`).
 */
export type Dictionary = typeof es;
