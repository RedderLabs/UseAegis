# @aegis/transport

## Qué hace
Expone una interfaz única (`Transport`: `send`, `onMessage`, `start`/`stop`,
`isAvailable`, `activeMode`) independiente del modo activo, y gestiona la
selección de transporte y el failover A → B → C.

- **Modo A — relay (implementado):** `createRelayTransport`. Deja sobres en el
  buzón del destinatario y sondea el propio buzón por un cursor incremental. No
  conoce `apps/web`: recibe el acceso al relay (`RelayBackend`) y la persistencia
  del cursor (`CursorStore`) por **inyección de dependencias**.
- **Failover:** `createFailoverTransport([...])` prueba los candidatos en orden al
  enviar (recuerda el que entregó en `activeMode`) y deduplica por `id` en
  recepción. Modos B (libp2p) y C (mesh) son andamiaje de las fases 3–5
  (`docs/ARQUITECTURA.md §9`): se añaden a la lista sin tocar a los consumidores.

## Qué NO hace
No cifra ni descifra (eso es `@aegis/crypto-core` / `apps/web/lib/crypto`). No
interpreta el contenido del blob: solo lo transporta. No conoce identidades de
usuario más allá del PeerID.

## Cómo lo cablea la web (pendiente de adopción)
Hoy la funcionalidad Modo A vive directa en `apps/web/lib/chat.ts`. La adopción
consiste en construir un `RelayBackend` sobre `lib/relay-client` (`sendMessage` /
`fetchMessages`) y un `CursorStore` sobre `localStorage`, y pasar el transporte
resultante a `createFailoverTransport`. La cripto de sobre (sealed-sender) sigue
ocurriendo antes de `send()` y después de `onMessage()`: el transporte solo ve
bytes opacos.

## Modelo de amenaza relevante
Protege la disponibilidad ante bloqueo del relay (failover a P2P/Mesh). No protege
confidencialidad por sí mismo — asume que el payload ya viene cifrado E2E.

## Dependencias externas
- `libp2p` (Modo B), APIs de plataforma para BLE/Wi-Fi Aware (Modo C). Pendientes
  de las fases 3–5 del roadmap (`docs/ARQUITECTURA.md §9`).

## Tests
`pnpm --filter @aegis/transport test` — round-trip por relay, avance de cursor,
baja de handler y failover (salto, error total, dedup). Sin red ni Docker: usan
un relay falso en memoria y un scheduler manual.
