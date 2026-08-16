/**
 * Polyfills del entorno. SE IMPORTA EL PRIMERO, antes que cualquier módulo de cripto.
 *
 * React Native no trae `crypto` del navegador. `@aegis/crypto-core` concentra a propósito todo el
 * azar en un solo módulo (`random.ts`) justamente para que aquí baste con instalar el polyfill y no
 * haya que tocar la cripto: si falta, el fallo es explícito y ruidoso en vez de silencioso — que en
 * generación de claves es la diferencia entre "no arranca" y "arranca con claves predecibles".
 *
 * `randomUUID` no lo cubre `react-native-get-random-values`, y lo usa `chat.ts` para el `mid` de
 * cada mensaje saliente (el id con el que la self-copy se casa con el mensaje optimista local). Se
 * construye aquí sobre el CSPRNG ya polirellenado, con el formato v4 de siempre.
 */
import "react-native-get-random-values";

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  throw new Error(
    "CSPRNG no disponible: react-native-get-random-values no se cargó. Sin él no se pueden generar claves.",
  );
}

if (typeof globalThis.crypto.randomUUID !== "function") {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: (): `${string}-${string}-${string}-${string}-${string}` => {
      const b = new Uint8Array(16);
      globalThis.crypto.getRandomValues(b);
      // Versión 4 y variante RFC 4122, igual que la implementación del navegador.
      b[6] = ((b[6] as number) & 0x0f) | 0x40;
      b[8] = ((b[8] as number) & 0x3f) | 0x80;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
    },
  });
}

export {};
