// Bus de avisos "hay sobre nuevo para X" — la pieza que permite el push en tiempo real (SSE)
// sin volver al polling. NO transporta el sobre (que es opaco y sealed-sender): solo un aviso
// con la clave pública del destinatario, para que su conexión SSE dispare un fetch normal por
// cursor. El contenido sigue viajando por el buzón cifrado de siempre.
//
// Dos capas:
//   - EventEmitter EN PROCESO: reparte el aviso a las conexiones SSE de ESTA instancia.
//   - Puente DragonflyDB (Redis pub/sub) OPCIONAL: si hay REDIS_URL, el aviso se publica en un
//     canal y CADA instancia (incluida la propia) lo recibe por su suscriptor y lo re-emite en
//     local. Así funciona con varias réplicas del relay detrás del balanceador. Sin REDIS_URL
//     (dev, una sola instancia) se emite directo en local. Nunca hay doble aviso: con Redis, el
//     único camino es publicar→suscriptor→emit local; sin Redis, emit local directo.
import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import { config } from "../config";

/** Canal de pub/sub y nombre del evento interno. */
const CHANNEL = "aegis:mailbox";

const emitter = new EventEmitter();
// Habrá una escucha por conexión SSE abierta: sin tope para no soltar el warning de fugas.
emitter.setMaxListeners(0);

let pub: Redis | null = null;
let sub: Redis | null = null;
let ready = false;

/** Emite el aviso a las conexiones SSE de esta instancia. */
function notifyLocal(recipientB64: string): void {
  emitter.emit(CHANNEL, recipientB64);
}

/**
 * Inicializa el puente Dragonfly si hay REDIS_URL. Idempotente y tolerante: si Redis no está,
 * el relay sigue funcionando con avisos solo en proceso (correcto para una única instancia).
 */
export async function initMailboxEvents(log: FastifyBaseLogger): Promise<void> {
  if (!config.redisUrl || ready) return;
  try {
    const { default: IORedis } = await import("ioredis");
    pub = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    sub = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    pub.on("error", (err) => log.warn({ err }, "mailbox pub/sub (Dragonfly) error"));
    sub.on("error", (err) => log.warn({ err }, "mailbox pub/sub (Dragonfly) error"));
    sub.on("message", (_channel, message) => notifyLocal(message));
    await sub.subscribe(CHANNEL);
    ready = true;
    log.info("push en tiempo real: pub/sub sobre Dragonfly activo");
  } catch (err) {
    // No es fatal: caemos a avisos solo en proceso.
    log.warn({ err }, "no se pudo activar pub/sub sobre Dragonfly; avisos solo en proceso");
    pub = null;
    sub = null;
    ready = false;
  }
}

/**
 * Anuncia que hay un sobre nuevo para `recipientB64`. Con Dragonfly, lo publica (y el suscriptor
 * de cada instancia lo re-emite). Sin Dragonfly o si la publicación falla, emite en local para no
 * perder el aviso al menos en esta instancia. Es best-effort: nunca lanza.
 */
export function publishNewMessage(recipientB64: string): void {
  if (ready && pub) {
    pub.publish(CHANNEL, recipientB64).catch(() => notifyLocal(recipientB64));
    return;
  }
  notifyLocal(recipientB64);
}

/** Suscribe una conexión SSE a los avisos de `recipientB64`. Devuelve la baja. */
export function onNewMessage(recipientB64: string, cb: () => void): () => void {
  const listener = (r: string) => {
    if (r === recipientB64) cb();
  };
  emitter.on(CHANNEL, listener);
  return () => {
    emitter.off(CHANNEL, listener);
  };
}

/** Cierra las conexiones de pub/sub (apagado limpio). */
export async function closeMailboxEvents(): Promise<void> {
  ready = false;
  await Promise.allSettled([pub?.quit(), sub?.quit()]);
  pub = null;
  sub = null;
}
