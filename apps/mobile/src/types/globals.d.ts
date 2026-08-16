/**
 * Globales que la app da por supuestos, declarados A MANO y a propósito.
 *
 * El `tsconfig` de este paquete NO incluye la librería `DOM`: así TypeScript avisa cuando alguien
 * arrastra por costumbre un `window`, un `localStorage` o un `crypto.subtle` desde la web. El precio
 * es que hay que declarar aquí lo poquísimo del entorno del navegador que React Native sí ofrece —
 * y ese precio es justo lo que se quiere pagar: esta lista ES el inventario de suposiciones sobre la
 * plataforma. Si crece, hay que mirarla con lupa.
 *
 * HALLAZGO (2026-08-16): `@aegis/crypto-core` usa `TextEncoder`/`TextDecoder` (`bytes.ts`), que son
 * globales del navegador. El ROADMAP daba por retiradas tres ataduras (`crypto.subtle`, `btoa`/
 * `atob` y el `dict()` del i18n) — ésta es la cuarta y no estaba en la lista. En React Native
 * moderno existen en tiempo de ejecución (Hermes las trae), así que NO bloquea; pero es una
 * suposición sobre la plataforma que estaba sin declarar, y en el móvil las suposiciones sin
 * declarar se pagan tarde. Anotada en ROADMAP.md (track móvil).
 */

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}

/** Solo lo que de verdad se usa: el CSPRNG y el generador de UUID. Nada de `subtle`. */
interface AegisCrypto {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID?: () => string;
}

declare var crypto: AegisCrypto;
