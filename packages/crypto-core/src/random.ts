/**
 * Único punto de entrada al CSPRNG. Todo lo que necesite azar en la cripto pasa por aquí.
 *
 * Motivo: `crypto.getRandomValues` existe en el navegador y en Node ≥19, pero en React Native
 * hay que traerlo con un polyfill (`react-native-get-random-values`). Teniendo un solo sitio,
 * portar el paquete al móvil es importar el polyfill una vez, y si falta el fallo es un error
 * explícito en el arranque en vez de azar de baja calidad colándose en una clave.
 *
 * Regla dura (docs/PLANTILLA.md §5): NUNCA `Math.random` para nada criptográfico.
 */

/** `n` bytes del CSPRNG del sistema. */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  return fillRandom(out);
}

/**
 * Rellena `out` con azar del sistema. `getRandomValues` rechaza más de 65536 B por llamada
 * (límite de la Web Crypto API), así que se va por trozos: importa para las claves de adjuntos
 * grandes y para los tests que generan varios MB.
 */
export function fillRandom(out: Uint8Array): Uint8Array {
  const g = globalThis.crypto;
  if (!g || typeof g.getRandomValues !== "function") {
    throw new Error(
      "No hay CSPRNG disponible (crypto.getRandomValues). En React Native importa " +
        "'react-native-get-random-values' antes que @aegis/crypto-core.",
    );
  }
  for (let off = 0; off < out.length; off += 65536) {
    g.getRandomValues(out.subarray(off, Math.min(off + 65536, out.length)));
  }
  return out;
}
