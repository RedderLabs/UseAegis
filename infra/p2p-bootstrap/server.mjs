/**
 * Nodo bootstrap + relay de circuito (Modo B / Fase 3, decisión D2).
 *
 * Papel doble, en el MISMO host que ya corre relay + .onion (docs/aegis-fase3-libp2p-spike.md §D2):
 *   1) BOOTSTRAP: punto de entrada conocido a la red P2P. Los navegadores hacen `bootstrap` a su
 *      multiaddr (`/ip4|dns/.../tcp/<port>/ws|wss/p2p/<PeerID>`) para descubrir peers.
 *   2) RELAY DE CIRCUITO v2: los navegadores reservan un circuito aquí, y ese circuito es el
 *      CANAL DE SEÑALIZACIÓN por el que libp2p establece las conexiones WebRTC navegador↔navegador
 *      (NAT traversal). El relay NO ve el contenido: los sobres van cifrados E2E extremo a extremo.
 *
 * Solo WebSockets: el navegador conecta por WS(S); el tráfico entre pares va por WebRTC a través del
 * circuito. No hace falta TCP crudo aquí (un peer no navegador podría añadirse luego).
 *
 * PeerID ESTABLE: se deriva de una semilla de 32 bytes persistida en el volumen (o inyectada por
 * `P2P_BOOTSTRAP_SEED`), para que el multiaddr de bootstrap no cambie entre reinicios.
 */
import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { generateKeyPairFromSeed } from "@libp2p/crypto/keys";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const WS_PORT = Number(process.env.WS_PORT ?? 9001);

/** Semilla estable → PeerID estable. Prioridad: env (despliegues reproducibles) > volumen > nueva. */
function loadSeed() {
  if (process.env.P2P_BOOTSTRAP_SEED) {
    const seed = Buffer.from(process.env.P2P_BOOTSTRAP_SEED, "hex");
    if (seed.length !== 32) throw new Error("P2P_BOOTSTRAP_SEED debe ser 32 bytes en hex (64 chars).");
    return new Uint8Array(seed);
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const seedPath = `${DATA_DIR}/bootstrap-seed.bin`;
  if (existsSync(seedPath)) return new Uint8Array(readFileSync(seedPath));
  const seed = randomBytes(32);
  writeFileSync(seedPath, seed, { mode: 0o600 });
  return new Uint8Array(seed);
}

const privateKey = await generateKeyPairFromSeed("Ed25519", loadSeed());

const node = await createLibp2p({
  privateKey,
  addresses: {
    // Escucha WS en todas las interfaces del contenedor; en prod, Caddy termina TLS (wss) delante.
    listen: [`/ip4/0.0.0.0/tcp/${WS_PORT}/ws`],
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    // Relay de circuito v2: acepta reservas de los navegadores.
    //
    // En CLEARNET el circuito solo SEÑALIZA el WebRTC (navegador↔navegador directo). Pero sobre
    // TOR no hay WebRTC (UDP bloqueado): el sobre P2P se REENVÍA por el propio circuito (TCP). Para
    // eso el relay tiene que mover datos REALES, no solo el handshake:
    //   - applyDefaultLimit:false → sin tope de datos/duración por conexión relayada (por defecto
    //     los límites de *limited relay* cortarían un chat a los pocos KB/segundos). El relay sigue
    //     viendo solo BYTES OPACOS: el sobre va cifrado E2E, esto no cambia la cripto.
    //   - maxReservations:512 → sirve a muchos navegadores a la vez (el def. 15 se queda corto).
    // La contención vive fuera: mem_limit del contenedor + anti-DoS de la .onion (torrc).
    relay: circuitRelayServer({
      reservations: { maxReservations: 512, applyDefaultLimit: false },
    }),
  },
});

console.log(`[aegis-p2p-bootstrap] PeerID: ${node.peerId.toString()}`);
for (const ma of node.getMultiaddrs()) {
  console.log(`[aegis-p2p-bootstrap] listen: ${ma.toString()}`);
}
console.log(
  "[aegis-p2p-bootstrap] multiaddr de bootstrap para los navegadores (dev):\n" +
    `  /ip4/127.0.0.1/tcp/${WS_PORT}/ws/p2p/${node.peerId.toString()}`,
);

// Cierre grácil para que Docker pare limpio (SIGTERM en `docker compose down`).
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    node.stop().finally(() => process.exit(0));
  });
}
