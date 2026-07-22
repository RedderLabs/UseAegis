// Cliente S3 mínimo (path-style) con firma AWS Signature Version 4 hecha a mano.
//
// Por qué a mano y no `@aws-sdk/client-s3`: el relay mantiene un árbol de dependencias
// deliberadamente pequeño (solo fastify + pg). SigV4 es una cadena de HMAC-SHA256 bien
// especificada; con `x-amz-content-sha256: UNSIGNED-PAYLOAD` no hace falta ni hashear el
// cuerpo, así que la superficie es pequeña y auditable. Usa solo `node:crypto` y `fetch`
// (global en Node 22). Compatible con Backblaze B2 / Cloudflare R2 / AWS S3 / MinIO.
//
// El relay actúa de PROXY: el cliente nunca habla con el bucket (evita que un cliente en
// .onion se conecte a un tercero y filtre metadatos). El contenido subido ya viaja cifrado
// E2E; para el bucket es un blob opaco.
import { createHash, createHmac } from "node:crypto";
import type { MediaConfig } from "../config";

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";
const UNSIGNED = "UNSIGNED-PAYLOAD";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

// Codificación RFC 3986 de un segmento de path (S3 exige encoded en la CanonicalURI).
// encodeURIComponent no escapa !'()*, que sí deben escaparse.
function uriEncodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// Fecha AWS: '20260719T140501Z' (amzDate) y '20260719' (dateStamp), en UTC.
function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString(); // 2026-07-19T14:05:01.123Z
  const amzDate = iso.replace(/[:-]|\.\d{3}/g, ""); // 20260719T140501Z
  const dateStamp = amzDate.slice(0, 8); // 20260719
  return { amzDate, dateStamp };
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac("AWS4" + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/** Host del endpoint (sin esquema), p.ej. `s3.us-east-005.backblazeb2.com`. */
function endpointHost(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//, "");
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Firma una petición S3 path-style para `key` en el bucket configurado.
 * `bodySha` = hex(sha256(body)) o `UNSIGNED-PAYLOAD` (por defecto) para no hashear el cuerpo.
 */
function signRequest(
  cfg: MediaConfig,
  method: "PUT" | "GET" | "DELETE",
  key: string,
  now: Date,
  bodySha: string = UNSIGNED,
): SignedRequest {
  const host = endpointHost(cfg.endpoint);
  // Path-style: /<bucket>/<key>. La key es un UUID (sin caracteres especiales), pero se
  // codifica igualmente por robustez. La barra entre bucket y key NO se codifica.
  const canonicalUri = `/${uriEncodeSegment(cfg.bucket)}/${uriEncodeSegment(key)}`;
  const { amzDate, dateStamp } = amzDates(now);

  // Cabeceras canónicas: ordenadas, en minúscula, valor trim. Firmamos host + las dos x-amz.
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${bodySha}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // sin query string
    canonicalHeaders,
    signedHeaders,
    bodySha,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretKey, dateStamp, cfg.region))
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `${ALGORITHM} Credential=${cfg.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `${cfg.endpoint}${canonicalUri}`,
    headers: {
      host,
      "x-amz-content-sha256": bodySha,
      "x-amz-date": amzDate,
      authorization,
    },
  };
}

/** Sube `body` (ciphertext opaco) a `key`. Lanza si el bucket responde != 2xx. */
export async function putObject(cfg: MediaConfig, key: string, body: Buffer): Promise<void> {
  // Firmamos el payload real (no UNSIGNED) para que el bucket verifique integridad del subido.
  const req = signRequest(cfg, "PUT", key, new Date(), sha256Hex(body));
  const res = await fetch(req.url, {
    method: "PUT",
    headers: { ...req.headers, "content-length": String(body.length) },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`S3 PUT ${key} → ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
}

/**
 * Descarga `key`. Devuelve el cuerpo como stream web (para reenviarlo a Fastify sin cargar en
 * memoria) y el content-length si el bucket lo reporta. Lanza si no existe (404) o error.
 */
export async function getObject(
  cfg: MediaConfig,
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; contentLength: number | null }> {
  const req = signRequest(cfg, "GET", key, new Date(), sha256Hex(""));
  const res = await fetch(req.url, { method: "GET", headers: req.headers });
  if (!res.ok || !res.body) {
    const text = res.ok ? "" : await res.text().catch(() => "");
    throw new Error(`S3 GET ${key} → ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  const len = res.headers.get("content-length");
  return { body: res.body, contentLength: len ? Number(len) : null };
}

/** Borra `key`. No lanza si ya no existe (S3 devuelve 204 igualmente). */
export async function deleteObject(cfg: MediaConfig, key: string): Promise<void> {
  const req = signRequest(cfg, "DELETE", key, new Date(), sha256Hex(""));
  const res = await fetch(req.url, { method: "DELETE", headers: req.headers });
  // 204 = borrado; 404 = ya no estaba. Ambos aceptables para un GC idempotente.
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`S3 DELETE ${key} → ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
}

// Exportado solo para tests unitarios del firmante (vectores conocidos).
export const __testing = { signRequest, amzDates, sha256Hex };
