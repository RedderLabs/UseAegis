# Aegis — Arquitectura

## 1. Principio rector

Una identidad criptográfica única, un protocolo de mensaje cifrado único, y transporte intercambiable en tiempo de ejecución. El transporte nunca condiciona la seguridad del contenido — solo su disponibilidad y latencia.

```
                    Identidad (Ed25519 / X25519)
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              Transporte A   Transporte B   Transporte C
               (Relay)         (libp2p)     (BLE / Wi-Fi Aware)
                    │             │             │
              internet normal  censura /    sin internet,
                               sin relay    sin infraestructura
```

## 2. Capa de identidad

- **Ed25519**: par de claves de firma, identidad estable del usuario. No hay cuentas, no hay número de teléfono, no hay email.
- **X25519**: derivado para acuerdo de claves (ECDH) por sesión/conversación.
- **Argon2id**: derivación de clave desde passphrase local, si el usuario protege su almacén de claves con contraseña en el dispositivo.
- **Intercambio de contacto**: código QR que codifica la clave pública Ed25519 — verificación fuera de banda, sin directorio central de usuarios.
- **PeerID (Modo B)**: se deriva directamente de la misma clave Ed25519 — no existe una "segunda identidad" para el modo P2P.

## 3. Capa de cifrado de contenido

Idéntica en los tres modos de transporte — el transporte nunca ve el contenido en claro:

- **XChaCha20-Poly1305** para cifrado autenticado del payload (texto, audio, futuros archivos).
- **crypto_secretstream** (libsodium) para chunking de payloads grandes (audio largo, archivos) — permite cifrar/descifrar en streaming sin cargar el blob completo en memoria, y detecta reordenamiento o truncamiento de chunks.
- **Sealed sender**: el relay (Modo A) no conoce el remitente real del mensaje, solo el destinatario y el blob cifrado.

### Pipeline de un mensaje de audio

1. Grabación local con `MediaRecorder` (web) → codec Opus.
2. Cifrado en chunks con `crypto_secretstream`, clave derivada por ECDH de la sesión (X25519).
3. Envío del blob cifrado por el transporte activo (A, B o C — indistinto para el protocolo).
4. En destino: descifrado en streaming, reproducción progresiva sin esperar el archivo completo.
5. Borrado del blob en el relay tras confirmación de entrega (Modo A) o expiración TTL si el destinatario no se conecta.

## 4. Transporte A — Relay centralizado

- Stack: Fastify + PostgreSQL + Redis + BullMQ (colas de entrega) + Docker Compose.
- Rol del servidor: cola de blobs cifrados, sealed sender, sin acceso a claves privadas ni contenido en claro.
- Uso por defecto: mejor latencia, entrega inmediata si ambos usuarios están online.
- Punto débil aceptado: es un punto único operado por Redder Labs — puede ser bloqueado a nivel de red o presionado legalmente (aunque no tiene nada que entregar salvo blobs cifrados y metadata mínima).

### 4.1 Endpoint .onion (extensión del Modo A, no un modo nuevo)

El relay expone un segundo punto de entrada como servicio onion v3, además del dominio clearnet habitual. No es un transporte distinto — es el mismo relay (Fastify + PostgreSQL + Redis + BullMQ), accesible por una ruta adicional resistente a bloqueo de DNS/IP.

**Por qué encaja sin fricción con la arquitectura existente**: un dominio `.onion` v3 se deriva matemáticamente de un par de claves Ed25519 (base32 de la clave pública + checksum + versión) — la misma primitiva que ya se usa para la identidad del usuario en la capa de identidad (§2). El daemon Tor puede importar una clave Ed25519 ya generada en vez de crear una nueva, así que el onion service hereda la misma disciplina de gestión de claves del resto del proyecto, en vez de introducir una identidad de infraestructura suelta y sin trazabilidad.

**Configuración del daemon Tor sobre el nodo de relay (Proxmox):**

```
# /etc/tor/torrc
HiddenServiceDir /var/lib/tor/aegis/
HiddenServicePort 443 127.0.0.1:8443   # Fastify detrás de Caddy, solo loopback
```

La dirección `.onion` final aparece en `HiddenServiceDir/hostname` tras el primer arranque del daemon.

**Selección de endpoint en el cliente:**

```
transport-relay/
  ├── clearnet.ts   # dominio normal + Caddy + TLS, endpoint por defecto
  └── onion.ts      # .onion + proxy SOCKS5 local a Tor
```

Failover del mismo tipo que ya existe entre Modo A/B/C: si el endpoint clearnet no responde (bloqueo de DNS o IP), el cliente reintenta contra el `.onion` antes de escalar a Modo B (libp2p). Requiere que el cliente tenga acceso a un proxy SOCKS5 a Tor — en móvil, vía una librería de Tor embebida (tipo Onion Proxy Library); en web, requiere Tor Browser o un proxy local configurado por el usuario. Esto limita la adopción del endpoint `.onion` a usuarios que específicamente lo activan, coherente con el principio de "cero fricción por defecto, máxima resistencia bajo demanda" (ver DISEÑO.md §6, indicador de modo).

**Qué cambia y qué no cambia en el modelo de amenaza:**
- No cambia: el contenido sigue cifrado E2E igual que en clearnet; el `.onion` no añade ni quita confidencialidad al mensaje en sí.
- Sí cambia: oculta la IP real del relay y evita que un bloqueo de DNS/IP a nivel de censura estatal tumbe el acceso — el problema que resuelve es de **alcanzabilidad**, no de confidencialidad de contenido (que ya estaba resuelta).

## 5. Transporte B — P2P vía libp2p

- **Descubrimiento**: DHT tipo Kademlia para localizar peers sin directorio central.
- **NAT traversal**: circuit relay de libp2p para conectar peers detrás de NAT/firewall doméstico.
- **Cifrado de transporte**: Noise protocol (nativo de libp2p) — capa adicional por debajo del E2E de aplicación; redundante en confidencialidad pero necesario para autenticar el enlace punto a punto.
- **Store-and-forward**: si el destinatario no está online, el blob cifrado se propaga vía GossipSub y queda en cache temporal en peers voluntarios de la red hasta que el destinatario se conecta.
- **Cuándo se activa**: fallback automático si el relay no responde en un umbral de tiempo, o activación manual por el usuario.

## 6. Transporte C — Mesh local (BLE / Wi-Fi Aware)

Reutiliza el diseño ya validado en el protocolo de comunicación de emergencia:

- **Sin infraestructura**: no requiere routers, torres de telefonía ni internet.
- **BLE mesh flooding**: para alcance corto y baja tasa de datos (texto, mensajes cortos).
- **Wi-Fi Aware**: para mayor ancho de banda cuando está disponible (audio, archivos).
- **Store-and-forward físico**: el mensaje cifrado salta de dispositivo en dispositivo dentro del alcance físico de la malla hasta alcanzar al destinatario o un puente hacia internet.
- **Tor**: usado en el modo global para anonimizar IP; los onion services se derivan de la misma clave Ed25519. No aplica dentro de la malla local (no hay IP/internet que anonimizar ahí).
- **WireGuard**: descartado como transporte del protocolo de usuario (introduce un punto de descifrado innecesario si se coloca por debajo del E2E). Uso restringido a infraestructura propia: malla privada entre nodos de servidor (Proxmox) o acceso a instancias self-hosted.

## 7. Capa de abstracción de transporte

Módulo `packages/transport/` — expone una interfaz única (`send()`, `receive()`, `onMessage()`) independiente del modo activo. El cliente y el resto del protocolo nunca saben ni les importa por cuál de los tres transportes viaja un mensaje. La selección de transporte y el failover viven exclusivamente en este módulo.

```
transport.send(peerId, encryptedBlob)
  → intenta Modo A (timeout configurable)
  → si falla/no responde: intenta Modo B
  → si no hay red en absoluto: intenta Modo C
  → actualiza indicador de estado en UI (verde/ámbar/rojo)
```

## 8. Modelo de amenaza (resumen — detalle completo en `THREAT_MODEL.md`)

| Amenaza | Mitigación |
|---|---|
| Servidor relay comprometido o embargado | Sealed sender + E2E: no hay contenido ni identidad de remitente que entregar |
| Bloqueo de red al relay (censura estatal) | Failover a Modo B (libp2p) o Modo C (mesh local) |
| Interceptación de tráfico en tránsito | E2E con XChaCha20-Poly1305, independiente del transporte |
| Backdoor insertado en el cliente (tipo Chat Control 2.0) | Código abierto + reproducible builds — cualquier hook de escaneo sería detectable en el binario publicado |
| Correlación de metadata (tamaño/timing de mensajes) | Pendiente evaluar padding de tamaño de audio en v2 |
| Compromiso de dispositivo del usuario | Fuera de alcance del protocolo — se documenta como límite explícito, no se promete protección que no se puede dar |

## 9. Roadmap técnico

| Fase | Entregable |
|---|---|
| 1 | MVP Modo A: texto + audio, cifrado E2E completo, UI mínima |
| 2 | Integración de `packages/transport/` como capa de abstracción (aunque solo exista Modo A al inicio, se construye la interfaz ya pensada para B y C) |
| 3 | Spike técnico de libp2p (Modo B) — descubrimiento, NAT traversal, store-and-forward básico |
| 4 | Failover automático A → B con indicador de estado en UI |
| 5 | Integración de Modo C reutilizando el protocolo de mesh de emergencia existente |
| 6 | Soporte de archivos genéricos (mismo pipeline de chunking, solo cambia MIME type) |
| 7 | Reproducible builds + primer proceso de auditoría externa del código publicado |