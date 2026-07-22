/**
 * Failover A → B → C. Envuelve varios transportes concretos (relay, p2p, mesh) tras la misma
 * interfaz `Transport`, de modo que el resto del protocolo nunca sabe por cuál viajó el mensaje.
 *
 *  - send(): prueba los candidatos EN ORDEN; entrega por el primero que lo acepta y recuerda su
 *    modo como `activeMode`. Si todos fallan, propaga el último error.
 *  - recepción: escucha en TODOS los candidatos a la vez y deduplica por `id`, porque un mismo
 *    sobre podría llegar por más de una vía (p. ej. relay y mesh) durante una transición.
 *
 * Hoy solo el Modo A (relay) está implementado; B y C son andamiaje de las fases 3–5
 * (docs/ARQUITECTURA.md §9). La lista de candidatos crece sin tocar a los consumidores.
 */
import type { MessageHandler, Transport, TransportMode, WireEnvelope } from "./types";

/** Cuántos ids recordar para deduplicar entrantes entre vías (cota para no crecer sin límite). */
const SEEN_LIMIT = 4096;

/** Crea un transporte con failover sobre `candidates`, probados en el orden dado. */
export function createFailoverTransport(candidates: Transport[]): Transport {
  if (candidates.length === 0) {
    throw new Error("createFailoverTransport requiere al menos un transporte.");
  }

  let activeMode: TransportMode = candidates[0]!.activeMode;
  const seen = new Set<string>();
  // Bajas de las suscripciones abiertas en los candidatos, por handler externo.
  const unsubscribes = new Map<MessageHandler, Array<() => void>>();

  /** Deduplica por id: true la primera vez que se ve un sobre, false si ya se entregó. */
  function firstSight(env: WireEnvelope): boolean {
    if (seen.has(env.id)) return false;
    if (seen.size >= SEEN_LIMIT) seen.clear(); // olvido en bloque: simple y acotado para el MVP
    seen.add(env.id);
    return true;
  }

  return {
    get activeMode() {
      return activeMode;
    },

    async isAvailable() {
      const results = await Promise.all(candidates.map((c) => c.isAvailable().catch(() => false)));
      return results.some(Boolean);
    },

    async send(peerId, blob) {
      let lastError: unknown;
      for (const candidate of candidates) {
        try {
          await candidate.send(peerId, blob);
          activeMode = candidate.activeMode;
          return;
        } catch (err) {
          lastError = err; // este modo no pudo; probamos el siguiente
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("Ningún transporte pudo entregar el mensaje.");
    },

    onMessage(handler) {
      // El mismo handler externo se registra en cada candidato, pero solo se le entrega la
      // PRIMERA aparición de cada sobre (dedup por id).
      const deduped: MessageHandler = (env) => (firstSight(env) ? handler(env) : undefined);
      const offs = candidates.map((c) => c.onMessage(deduped));
      unsubscribes.set(handler, offs);
      return () => {
        for (const off of unsubscribes.get(handler) ?? []) off();
        unsubscribes.delete(handler);
      };
    },

    start() {
      for (const c of candidates) c.start();
    },

    stop() {
      for (const c of candidates) c.stop();
    },
  };
}
