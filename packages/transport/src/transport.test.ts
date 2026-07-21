// Tests del transporte: round-trip por relay (Modo A), avance de cursor y failover A → B → C.
// Ejecutable en Node con: pnpm --filter @aegis/transport test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Scheduler, Transport, WireEnvelope } from "./types";
import {
  createRelayTransport,
  type CursorStore,
  type RelayBackend,
  type RelayStream,
} from "./relay";
import { createFailoverTransport } from "./failover";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** Deja correr los microtasks/macrotasks pendientes (p. ej. la primera vuelta de `start()`). */
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

/** Scheduler manual: guarda las funciones de polling y las dispara a mano en el test. */
function manualScheduler() {
  const fns: Array<() => void | Promise<void>> = [];
  const scheduler: Scheduler = {
    setInterval(fn) {
      fns.push(fn);
      return fns.length; // id = posición 1-based
    },
    clearInterval(id) {
      fns[id - 1] = () => {}; // baja: reemplaza por no-op
    },
  };
  return {
    scheduler,
    async tick() {
      for (const fn of fns) await fn();
    },
  };
}

/** Cursor en memoria (equivalente al localStorage de la web). */
function memCursor(): CursorStore {
  let c: string | undefined;
  return { load: () => c, save: (v) => (c = v) };
}

/** Red de relay falsa en memoria: buzones por PeerID y cursor monótono comparable como string. */
function makeRelayNet() {
  const mailboxes = new Map<string, WireEnvelope[]>();
  let seq = 0;
  function backendFor(ownId: string): RelayBackend {
    return {
      async send(peerId, blob) {
        seq += 1;
        const cursor = String(seq).padStart(9, "0");
        const box = mailboxes.get(peerId) ?? [];
        box.push({ id: `env-${cursor}`, blob, cursor });
        mailboxes.set(peerId, box);
      },
      async fetch(after) {
        const box = mailboxes.get(ownId) ?? [];
        return after ? box.filter((e) => e.cursor > after) : box.slice();
      },
      async health() {
        return true;
      },
    };
  }
  return { backendFor, mailboxes };
}

test("relay: entrega, recibe por polling y avanza el cursor (sin reentregar)", async () => {
  const net = makeRelayNet();
  const ms = manualScheduler();
  const bob = createRelayTransport({
    backend: net.backendFor("bob"),
    cursor: memCursor(),
    scheduler: ms.scheduler,
  });
  const alice = net.backendFor("alice"); // solo para usar send()

  const received: string[] = [];
  bob.onMessage((env) => void received.push(dec(env.blob)));
  bob.start();
  await flush(); // primera vuelta: buzón vacío

  await alice.send("bob", enc("hola"));
  await alice.send("bob", enc("qué tal"));
  await ms.tick();
  assert.deepEqual(received, ["hola", "qué tal"]);

  // Sin novedades, otra vuelta no reentrega lo ya visto.
  await ms.tick();
  assert.deepEqual(received, ["hola", "qué tal"]);

  // Un tercer sobre solo entrega el nuevo (cursor > último visto).
  await alice.send("bob", enc("último"));
  await ms.tick();
  assert.deepEqual(received, ["hola", "qué tal", "último"]);

  bob.stop();
});

test("relay: onMessage devuelve una baja que corta la entrega", async () => {
  const net = makeRelayNet();
  const ms = manualScheduler();
  const me = createRelayTransport({
    backend: net.backendFor("me"),
    cursor: memCursor(),
    scheduler: ms.scheduler,
  });
  const seen: string[] = [];
  const off = me.onMessage((env) => void seen.push(dec(env.blob)));
  me.start();
  await flush();

  const peer = net.backendFor("peer");
  await peer.send("me", enc("uno"));
  await ms.tick();
  assert.deepEqual(seen, ["uno"]);

  off(); // baja
  await peer.send("me", enc("dos"));
  await ms.tick();
  assert.deepEqual(seen, ["uno"], "tras la baja no debería llegar nada más");
  me.stop();
});

/** Canal de avisos falso: el test dispara `poke()` y cambia el estado con `setConnected()`. */
function makeFakeStream() {
  let onPoke: (() => void) | null = null;
  let onConnected: ((c: boolean) => void) | null = null;
  let closed = false;
  const stream: RelayStream = {
    open(poke, connected) {
      onPoke = poke;
      onConnected = connected ?? null;
      return () => {
        closed = true;
      };
    },
  };
  return {
    stream,
    poke: () => onPoke?.(),
    setConnected: (c: boolean) => onConnected?.(c),
    get closed() {
      return closed;
    },
  };
}

test("stream: un aviso dispara un fetch inmediato sin esperar al sondeo", async () => {
  const net = makeRelayNet();
  const ms = manualScheduler();
  const fake = makeFakeStream();
  const bob = createRelayTransport({
    backend: net.backendFor("bob"),
    cursor: memCursor(),
    scheduler: ms.scheduler,
    stream: fake.stream,
  });
  const received: string[] = [];
  bob.onMessage((env) => void received.push(dec(env.blob)));
  bob.start();
  await flush(); // primera vuelta: vacío

  const alice = net.backendFor("alice");
  await alice.send("bob", enc("urgente"));
  // NO disparamos el scheduler: solo el aviso del stream debe entregar el sobre.
  fake.poke();
  await flush();
  assert.deepEqual(received, ["urgente"]);

  bob.stop();
  assert.ok(fake.closed, "stop() debe cerrar el stream");
});

test("stream: al conectar recupera lo dejado durante el corte", async () => {
  const net = makeRelayNet();
  const ms = manualScheduler();
  const fake = makeFakeStream();
  const me = createRelayTransport({
    backend: net.backendFor("me"),
    cursor: memCursor(),
    scheduler: ms.scheduler,
    stream: fake.stream,
  });
  const seen: string[] = [];
  me.onMessage((env) => void seen.push(dec(env.blob)));
  me.start();
  await flush();

  // Llega un sobre mientras el canal estaba caído; al (re)conectar, un fetch lo recupera.
  await net.backendFor("peer").send("me", enc("perdido"));
  fake.setConnected(true);
  await flush();
  assert.deepEqual(seen, ["perdido"]);

  me.stop();
});

test("failover: salta un transporte caído y entrega por el siguiente", async () => {
  const net = makeRelayNet();
  const ms = manualScheduler();
  const failing: Transport = {
    activeMode: "p2p",
    isAvailable: async () => false,
    send: async () => {
      throw new Error("p2p caído");
    },
    onMessage: () => () => {},
    start: () => {},
    stop: () => {},
  };
  const relay = createRelayTransport({
    backend: net.backendFor("me"),
    cursor: memCursor(),
    scheduler: ms.scheduler,
  });
  const t = createFailoverTransport([failing, relay]);

  await t.send("bob", enc("via failover"));
  assert.equal(t.activeMode, "relay", "debe recordar el modo que sí entregó");
  assert.equal(net.mailboxes.get("bob")?.length, 1);
});

test("failover: propaga el error si TODOS los transportes fallan", async () => {
  const down = (mode: Transport["activeMode"]): Transport => ({
    activeMode: mode,
    isAvailable: async () => false,
    send: async () => {
      throw new Error(`${mode} caído`);
    },
    onMessage: () => () => {},
    start: () => {},
    stop: () => {},
  });
  const t = createFailoverTransport([down("relay"), down("p2p"), down("mesh")]);
  await assert.rejects(() => t.send("bob", enc("nadie")), /caído/);
});

test("failover: deduplica un sobre que llega por dos vías", async () => {
  const ms = manualScheduler();
  const env: WireEnvelope = { id: "dup-1", blob: enc("uno"), cursor: "000000001" };
  const mkBackend = (): RelayBackend => ({
    send: async () => {},
    health: async () => true,
    fetch: async (after) => (after ? [] : [env]),
  });
  const a = createRelayTransport({ backend: mkBackend(), cursor: memCursor(), scheduler: ms.scheduler });
  const b = createRelayTransport({ backend: mkBackend(), cursor: memCursor(), scheduler: ms.scheduler });
  const t = createFailoverTransport([a, b]);

  let count = 0;
  t.onMessage(() => void (count += 1));
  t.start();
  await flush(); // ambas vías entregan env en su primera vuelta
  await ms.tick();
  assert.equal(count, 1, "un mismo id solo debe entregarse una vez");

  t.stop();
});
