# @aegis/transport

## Qué hace
Expone una interfaz única (`send`, `onMessage`, `activeMode`) independiente del
modo activo, y gestiona la selección de transporte y el failover A → B → C.

## Qué NO hace
No cifra ni descifra (eso es `@aegis/crypto-core`). No interpreta el contenido del
blob: solo lo transporta. No conoce identidades de usuario más allá del PeerID.

## Modelo de amenaza relevante
Protege la disponibilidad ante bloqueo del relay (failover a P2P/Mesh). No protege
confidencialidad por sí mismo — asume que el payload ya viene cifrado E2E.

## Dependencias externas
- `libp2p` (Modo B), APIs de plataforma para BLE/Wi-Fi Aware (Modo C). Pendientes
  de las fases 3–5 del roadmap (`docs/ARQUITECTURA.md §9`).
