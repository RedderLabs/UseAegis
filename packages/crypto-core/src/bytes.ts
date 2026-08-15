/**
 * Utilidades de bytes sin dependencias de plataforma.
 *
 * `toBase64Url`/`fromBase64Url` se implementaban con `btoa`/`atob`, que son API del NAVEGADOR:
 * no existen en React Native (Hermes) y en Node solo desde la v16. Como estas dos funciones
 * codifican claves públicas e identidades —lo que viaja en los QR `aegis://contact`, en el
 * directorio del relay y dentro del sobre—, tienen que dar el MISMO string en los tres sitios.
 * Aquí van en JavaScript puro, sin `Buffer` ni `btoa`, para que ese "mismo string" sea un hecho
 * y no una coincidencia entre plataformas.
 *
 * Base64URL = base64 con `-`/`_` en vez de `+`/`/` y SIN relleno `=` (RFC 4648 §5), que es lo que
 * permite meter una clave en una URL o en un QR sin escapar nada.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Índice inverso del alfabeto: byte del carácter → valor de 6 bits (-1 = carácter no válido). */
const LOOKUP = /* @__PURE__ */ (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  // Alfabeto base64 estándar: se acepta a la ENTRADA por compatibilidad (códigos de recuperación
  // antiguos, texto pegado a mano). A la salida siempre se emite base64url.
  table["+".charCodeAt(0)] = 62;
  table["/".charCodeAt(0)] = 63;
  return table;
})();

/** Codifica bytes en base64url sin relleno. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[(n >>> 18) & 63]! +
      ALPHABET[(n >>> 12) & 63]! +
      ALPHABET[(n >>> 6) & 63]! +
      ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]!;
  }
  return out;
}

/**
 * Decodifica base64url (o base64 estándar) a bytes. Lanza ante cualquier carácter que no
 * pertenezca al alfabeto, igual que hacía `atob`: quien llama distingue "no es base64" de
 * "es base64 pero no mide 32 bytes", y esa diferencia se usa al importar una recuperación.
 */
export function fromBase64Url(value: string): Uint8Array {
  // El relleno es opcional en base64url; si viene, se ignora.
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") end--;

  const out = new Uint8Array(Math.floor((end * 6) / 8));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < end; i++) {
    const code = value.charCodeAt(i);
    const v = code < 128 ? LOOKUP[code]! : -1;
    if (v < 0) throw new Error("Base64url inválido.");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}

/** Concatena varios `Uint8Array` en uno nuevo. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const encoder = /* @__PURE__ */ new TextEncoder();
const decoder = /* @__PURE__ */ new TextDecoder();

/** UTF-8 → bytes. */
export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** bytes → UTF-8. */
export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
