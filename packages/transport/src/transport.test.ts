// Tests del transporte: round-trip por relay (Modo A), avance de cursor y failover A → B → C.
// Ejecutable en Node con: pnpm --filter @aegis/transport test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FailoverStatus, Scheduler, Transport, TransportMode, WireEnvelope } from "./types";
import {
  createRelayTransport,
  type CursorStore,
  type RelayBackend,
  type RelayStream,
} from "./relay";
import { createP2pTransport, type P2pNode } from "./p2p";
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

// --- Modo B (P2P/libp2p) — andamiaje de la Fase 3 --------------------------------------

/**
 * Red P2P falsa en memoria: entrega directa peer→peer (sin buzón). Modela lo que hará el
 * `P2pNode` real de libp2p, pero determinista: `send` a un peer READY llega a su `onEnvelope`;
 * a un peer no conectado, lanza (como un dial fallido → dispara el failover).
 */
function makeP2pNet() {
  const inboxes = new Map<string, ((env: WireEnvelope) => void)[]>();
  const ready = new Set<string>();
  let seq = 0;
  function nodeFor(ownId: string): P2pNode {
    return {
      async start() {
        ready.add(ownId);
      },
      async stop() {
        ready.delete(ownId);
      },
      async send(peerId, blob) {
        if (!ready.has(peerId)) throw new Error(`peer ${peerId} inalcanzable (sin ruta P2P)`);
        seq += 1;
        const cursor = String(seq).padStart(9, "0");
        const env: WireEnvelope = { id: `p2p-${cursor}`, blob, cursor };
        for (const cb of inboxes.get(peerId) ?? []) cb(env);
      },
      onEnvelope(cb) {
        const list = inboxes.get(ownId) ?? [];
        list.push(cb);
        inboxes.set(ownId, list);
        return () => inboxes.set(ownId, (inboxes.get(ownId) ?? []).filter((c) => c !== cb));
      },
      isReady() {
        return ready.has(ownId);
      },
    };
  }
  return { nodeFor };
}

test("p2p: entrega directa peer→peer y disponibilidad ligada al nodo", async () => {
  const net = makeP2pNet();
  const bob = createP2pTransport({ node: net.nodeFor("bob") });
  const alice = createP2pTransport({ node: net.nodeFor("alice") });

  const received: string[] = [];
  bob.onMessage((env) => void received.push(dec(env.blob)));

  assert.equal(await bob.isAvailable(), false, "sin start(), no disponible");
  bob.start();
  alice.start();
  await flush();
  assert.equal(await bob.isAvailable(), true, "arrancado y con ruta → disponible");

  await alice.send("bob", enc("hola directo"));
  assert.deepEqual(received, ["hola directo"]);

  bob.stop();
  assert.equal(await bob.isAvailable(), false, "tras stop(), no disponible");
});

test("p2p: send a un peer inalcanzable lanza (para que el failover pruebe otro modo)", async () => {
  const net = makeP2pNet();
  const me = createP2pTransport({ node: net.nodeFor("me") });
  me.start();
  await flush();
  await assert.rejects(() => me.send("fantasma", enc("hola")), /inalcanzable/);
});

test("p2p: start()/stop() son idempotentes", async () => {
  const net = makeP2pNet();
  const t = createP2pTransport({ node: net.nodeFor("me") });
  t.start();
  t.start(); // no debe duplicar suscripción ni arranque
  await flush();
  assert.equal(await t.isAvailable(), true);
  t.stop();
  t.stop(); // no debe reventar
  assert.equal(await t.isAvailable(), false);
});

test("failover A→B: con el relay caído, entrega por P2P", async () => {
  const p2p = makeP2pNet();
  const relayDown: Transport = {
    activeMode: "relay",
    isAvailable: async () => false,
    send: async () => {
      throw new Error("relay bloqueado (censura)");
    },
    onMessage: () => () => {},
    start: () => {},
    stop: () => {},
  };
  const bobP2p = createP2pTransport({ node: p2p.nodeFor("bob") });
  bobP2p.start();
  await flush();

  const alice = createFailoverTransport([relayDown, createP2pTransport({ node: p2p.nodeFor("alice") })]);
  alice.start();
  await flush();

  const seen: string[] = [];
  bobP2p.onMessage((env) => void seen.push(dec(env.blob)));

  await alice.send("bob", enc("por la puerta B"));
  assert.equal(alice.activeMode, "p2p", "debe recordar que entregó por P2P");
  assert.deepEqual(seen, ["por la puerta B"]);

  alice.stop(); // cierra el sondeo de salud del failover (start() lo abre desde la Fase 4)
  bobP2p.stop();
});

// --- Fase 4 — conmutación automática y estado observable -------------------------------

/**
 * Transporte de mentira con un interruptor: `set(false)` lo deja inalcanzable (sonda a false y
 * envío que lanza), `set(true)` lo devuelve. Modela "el relay se cae / vuelve" sin red.
 */
function switchable(mode: TransportMode, up = true) {
  const t: Transport = {
    activeMode: mode,
    isAvailable: async () => up,
    send: async () => {
      if (!up) throw new Error(`${mode} caído`);
    },
    onMessage: () => () => {},
    start: () => {},
    stop: () => {},
  };
  return {
    transport: t,
    set(v: boolean) {
      up = v;
    },
  };
}

/** Reloj manual: el estado del failover lleva marcas de tiempo y así son deterministas. */
function manualClock() {
  let t = 1_000;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

test("failover: un fallo suelto NO da un modo por caído (umbral anti-bandazo)", async () => {
  const relay = switchable("relay");
  const p2p = switchable("p2p");
  const t = createFailoverTransport([relay.transport, p2p.transport], { failureThreshold: 2 });

  relay.set(false);
  await t.send("bob", enc("uno")); // el relay falla una vez; entrega P2P
  assert.equal(t.status().modes[0]!.state, "unknown", "un solo fallo no AFIRMA que esté caído");
  assert.equal(t.status().modes[0]!.failures, 1);
  assert.equal(t.activeMode, "p2p", "pero la ruta real ya es P2P: por ahí salió el sobre");

  await t.send("bob", enc("dos")); // segundo fallo consecutivo → caído
  assert.equal(t.status().modes[0]!.state, "down");
  assert.equal(t.activeMode, "p2p", "con el relay caído, el activo conmuta a P2P");
  assert.equal(t.status().lastSwitch?.cause, "delivery");
});

test("failover: una sonda devuelve el activo al modo preferente cuando se recupera", async () => {
  const ms = manualScheduler();
  const clock = manualClock();
  const relay = switchable("relay", false);
  const p2p = switchable("p2p");
  const t = createFailoverTransport([relay.transport, p2p.transport], {
    failureThreshold: 1,
    scheduler: ms.scheduler,
    now: clock.now,
  });

  t.start();
  await flush(); // primera ronda de sondas: relay caído, p2p arriba
  assert.equal(t.activeMode, "p2p");
  assert.equal(t.status().reachable, true);

  relay.set(true);
  clock.advance(15_000);
  await ms.tick(); // la sonda ve el relay de vuelta
  assert.equal(t.activeMode, "relay", "el activo vuelve solo al preferente, sin enviar nada");
  assert.equal(t.status().lastSwitch?.cause, "recovery");
  assert.equal(t.status().modes[0]!.state, "up");

  t.stop();
});

test("failover: onStatus entrega una foto inicial y luego cada cambio", async () => {
  const relay = switchable("relay");
  const p2p = switchable("p2p");
  const t = createFailoverTransport([relay.transport, p2p.transport], { failureThreshold: 1 });

  const seen: FailoverStatus[] = [];
  const off = t.onStatus((s) => void seen.push(s));
  assert.equal(seen.length, 1, "el suscriptor recibe la foto actual al suscribirse");
  assert.equal(seen[0]!.activeMode, "relay");

  relay.set(false);
  await t.send("bob", enc("uno"));
  assert.ok(seen.length > 1, "un cambio de estado debe publicarse");
  assert.equal(seen[seen.length - 1]!.activeMode, "p2p");

  off();
  const before = seen.length;
  relay.set(true);
  await t.send("bob", enc("dos"));
  assert.equal(seen.length, before, "tras la baja no debe llegar nada más");
});

test("failover: sin ningún modo con ruta, se sigue intentando y se reporta 'sin ruta'", async () => {
  const ms = manualScheduler();
  const relay = switchable("relay", false);
  const p2p = switchable("p2p", false);
  const t = createFailoverTransport([relay.transport, p2p.transport], {
    failureThreshold: 1,
    scheduler: ms.scheduler,
  });

  t.start();
  await flush();
  assert.equal(t.status().reachable, false, "ningún candidato con ruta");
  await assert.rejects(() => t.send("bob", enc("nadie")), /caído/);

  // Aunque ambos estén marcados caídos, un envío posterior SIGUE intentándolos (último recurso).
  relay.set(true);
  await t.send("bob", enc("ahora sí"));
  assert.equal(t.activeMode, "relay");
  assert.equal(t.status().reachable, true);

  t.stop();
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
