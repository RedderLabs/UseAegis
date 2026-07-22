/**
 * PeerID de libp2p DERIVADO de la identidad Ed25519 (Modo B / Fase 3, decisión D4).
 *
 * Propiedad central: el PeerID de un peer NO necesita descubrirse por una DHT — se calcula a partir
 * de su clave pública Ed25519, que ya conoces de tus contactos / del directorio de prekeys
 * (ARQUITECTURA.md §2.5: "el PeerID se deriva de la MISMA clave Ed25519"). Así, para mandar por P2P
 * a un contacto, el cliente convierte su clave pública en un PeerID y se lo pasa al transporte; la
 * DHT (Kademlia) queda para una fase de escala, no para el spike.
 *
 * Módulo puro (bytes → string): sin estado, sin red.
 *
 * Propiedad verificada en runtime (2026-07-22, node directo): el PeerID derivado de la clave
 * PÚBLICA coincide byte a byte con el que anuncia un nodo construido con la MISMA semilla
 * (`generateKeyPairFromSeed('Ed25519', seed)` → `peerIdFromPublicKey`). No se deja test automático
 * porque `@libp2p/crypto` (protons-runtime) no resuelve bajo el runner `tsx` del repo; la propiedad
 * se re-comprueba al conectar dos navegadores (paso 5 del spike).
 */
import { publicKeyFromRaw } from "@libp2p/crypto/keys";
import { peerIdFromPublicKey } from "@libp2p/peer-id";

/**
 * Convierte una clave pública Ed25519 (32 bytes) en el PeerID de libp2p correspondiente, como
 * string (`12D3Koo…`). Es determinista y coincide con el PeerID que un nodo construido con esa
 * misma identidad anuncia (ver `createLibp2pNode`).
 */
export function libp2pPeerIdFromEd25519(ed25519PublicKey: Uint8Array): string {
  return peerIdFromPublicKey(publicKeyFromRaw(ed25519PublicKey)).toString();
}
