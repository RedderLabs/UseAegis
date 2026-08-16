// Round-trip y pruebas negativas del códec de URI de contacto (el contenido del QR).
// Corre con: pnpm --filter @aegis/web exec tsx --test lib/contact-uri.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_URI_PREFIX,
  contactUriFromBytes,
  encodeContactUri,
  parseContactUri,
} from "./contact-uri";
import {
  buildSignedPrekey,
  fromBase64Url,
  generateSeed,
  publicKeyFromSeed,
  toBase64Url,
  verifyPeerPrekey,
} from "./crypto";

/** Una clave pública Ed25519 de juguete: 32 bytes deterministas en base64url. */
function fakePub(seed = 7): string {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = (seed * (i + 1)) % 256;
  return toBase64Url(b);
}

/** Prekey X25519 de juguete (32 bytes). No se verifica aquí: este módulo es puro. */
function fakePrekey(seed = 13): string {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = (seed + i * 3) % 256;
  return toBase64Url(b);
}

/** Firma Ed25519 de juguete (64 bytes). */
function fakeSig(seed = 21): string {
  const b = new Uint8Array(64);
  for (let i = 0; i < 64; i++) b[i] = (seed * (i + 2)) % 256;
  return toBase64Url(b);
}

/** Lo que devuelve `parseContactUri` cuando NO hay key bundle en el código. */
function sinBundle(pub: string, handle: string | null) {
  return { pub, handle, prekey: null, prekeySignature: null };
}

test("round-trip: clave + handle", () => {
  const pub = fakePub();
  const uri = encodeContactUri({ pub, handle: "alicia7" });
  assert.equal(uri, `${CONTACT_URI_PREFIX}?k=${pub}&h=alicia7`);
  assert.deepEqual(parseContactUri(uri), sinBundle(pub, "alicia7"));
});

test("round-trip: sin handle", () => {
  const pub = fakePub(3);
  const uri = encodeContactUri({ pub, handle: null });
  assert.equal(uri, `${CONTACT_URI_PREFIX}?k=${pub}`);
  assert.deepEqual(parseContactUri(uri), sinBundle(pub, null));
});

test("normaliza el handle: quita @ y baja a minúsculas", () => {
  const pub = fakePub(9);
  assert.equal(encodeContactUri({ pub, handle: "@Alicia7" }), `${CONTACT_URI_PREFIX}?k=${pub}&h=alicia7`);
});

test("handle inválido se descarta (no rompe la URI)", () => {
  const pub = fakePub(9);
  // Espacios / símbolos no forman un handle válido → se omite, la clave se conserva.
  assert.equal(encodeContactUri({ pub, handle: "no vale!" }), `${CONTACT_URI_PREFIX}?k=${pub}`);
});

test("acepta una clave pública suelta (sin esquema)", () => {
  const pub = fakePub(11);
  assert.deepEqual(parseContactUri(`  ${pub}  `), sinBundle(pub, null));
});

test("rechaza clave que no son 32 bytes", () => {
  const short = toBase64Url(new Uint8Array(16));
  assert.equal(parseContactUri(`${CONTACT_URI_PREFIX}?k=${short}`), null);
  assert.throws(() => encodeContactUri({ pub: short, handle: null }));
});

test("rechaza versión / esquema desconocidos y basura", () => {
  const pub = fakePub();
  assert.equal(parseContactUri(`aegis://contact/v2?k=${pub}`), null);
  assert.equal(parseContactUri(`https://evil.example/?k=${pub}`), null);
  assert.equal(parseContactUri("hola qué tal"), null);
  assert.equal(parseContactUri(""), null);
});

test("exige k válido aunque vengan parámetros de más", () => {
  const pub = fakePub(5);
  assert.deepEqual(
    parseContactUri(`${CONTACT_URI_PREFIX}?k=${pub}&h=bob99&zz=loquesea`),
    sinBundle(pub, "bob99"),
  );
  assert.equal(parseContactUri(`${CONTACT_URI_PREFIX}?h=bob99`), null);
});

// --- Key bundle en el QR (alta sin relay) ---------------------------------------------

test("round-trip: QR autosuficiente con prekey + firma", () => {
  const pub = fakePub(2);
  const prekey = fakePrekey();
  const prekeySignature = fakeSig();
  const uri = encodeContactUri({ pub, handle: "carla2", prekey, prekeySignature });
  assert.equal(uri, `${CONTACT_URI_PREFIX}?k=${pub}&h=carla2&x=${prekey}&s=${prekeySignature}`);
  assert.deepEqual(parseContactUri(uri), { pub, handle: "carla2", prekey, prekeySignature });
});

test("COMPATIBILIDAD: un QR antiguo (solo k) se sigue leyendo, sin bundle", () => {
  // Es el código que ya tiene impreso/guardado la gente: no puede dejar de funcionar. Sin bundle,
  // quien añade cae al directorio, que es el comportamiento de siempre.
  const pub = fakePub(4);
  const antiguo = `${CONTACT_URI_PREFIX}?k=${pub}&h=dani42`;
  assert.deepEqual(parseContactUri(antiguo), sinBundle(pub, "dani42"));
});

test("prekey sin firma (o firma sin prekey) se descarta: nunca media verificación", () => {
  const pub = fakePub(6);
  const prekey = fakePrekey(5);
  const sig = fakeSig(9);
  // Media pareja no vale: una prekey sin firma no se puede comprobar, así que se ignora entera
  // y el alta cae al directorio en vez de guardar algo sin verificar.
  assert.deepEqual(parseContactUri(`${CONTACT_URI_PREFIX}?k=${pub}&x=${prekey}`), sinBundle(pub, null));
  assert.deepEqual(parseContactUri(`${CONTACT_URI_PREFIX}?k=${pub}&s=${sig}`), sinBundle(pub, null));
  // Y al codificar tampoco se escribe media pareja.
  assert.equal(encodeContactUri({ pub, handle: null, prekey }), `${CONTACT_URI_PREFIX}?k=${pub}`);
});

test("bundle con longitud equivocada se descarta (no invalida el QR)", () => {
  const pub = fakePub(8);
  const cortos = `${CONTACT_URI_PREFIX}?k=${pub}&x=${toBase64Url(new Uint8Array(16))}&s=${toBase64Url(new Uint8Array(32))}`;
  assert.deepEqual(parseContactUri(cortos), sinBundle(pub, null));
  // Basura no-base64url tampoco: se ignora, la identidad se conserva.
  assert.deepEqual(parseContactUri(`${CONTACT_URI_PREFIX}?k=${pub}&x=!!!&s=!!!`), sinBundle(pub, null));
});

test("contactUriFromBytes acepta el bundle tal como lo devuelve buildSignedPrekey", () => {
  const pub = fakePub(12);
  const prekey = fakePrekey(17);
  const signature = fakeSig(23);
  const uri = contactUriFromBytes(fromBase64Url(pub), "eva_9", {
    x25519PublicKey: fromBase64Url(prekey),
    signature: fromBase64Url(signature),
  });
  assert.deepEqual(parseContactUri(uri), {
    pub,
    handle: "eva_9",
    prekey,
    prekeySignature: signature,
  });
  // Sin bundle produce la URI corta de siempre.
  assert.equal(
    contactUriFromBytes(fromBase64Url(pub), "eva_9"),
    `${CONTACT_URI_PREFIX}?k=${pub}&h=eva_9`,
  );
});

test("el bundle del QR VERIFICA de verdad contra la identidad (y se rompe si lo tocas)", async () => {
  // La prueba que de verdad importa: que lo que viaja en el QR sea comprobable sin el relay. Si
  // esto pasa, el alta presencial es tan segura como la del directorio — la firma la hace la
  // identidad del peer, y el servidor nunca fue la fuente de confianza.
  const seed = generateSeed();
  const pub = await publicKeyFromSeed(seed);
  const bundle = await buildSignedPrekey(seed);

  const uri = contactUriFromBytes(pub, "presencial1", bundle);
  const leido = parseContactUri(uri);
  assert.ok(leido?.prekey && leido.prekeySignature);
  assert.equal(
    await verifyPeerPrekey(
      fromBase64Url(leido.pub),
      fromBase64Url(leido.prekey),
      fromBase64Url(leido.prekeySignature),
    ),
    true,
  );

  // Un atacante que cambie la prekey por la suya: la firma deja de cuadrar y se rechaza.
  const otra = await buildSignedPrekey(generateSeed());
  assert.equal(
    await verifyPeerPrekey(pub, otra.x25519PublicKey, fromBase64Url(leido.prekeySignature)),
    false,
  );
});

test("el QR completo cabe holgado en un código escaneable", () => {
  // ~214 caracteres: versión 10 con corrección M. Importa porque el QR se lee de una pantalla a
  // otra, a veces con poca luz: si creciera mucho más habría que bajar la corrección de errores.
  const uri = encodeContactUri({
    pub: fakePub(1),
    handle: "usuario_largo_12345",
    prekey: fakePrekey(2),
    prekeySignature: fakeSig(3),
  });
  assert.ok(uri.length < 260, `la URI mide ${uri.length} caracteres`);
});
