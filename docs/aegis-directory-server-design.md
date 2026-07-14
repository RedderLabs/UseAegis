# Aegis Directory Server — Diseño de descubrimiento P2P

Componente opcional y sustituible para resolver `clave_pública → direcciones .onion
conocidas`, sin que el servidor necesite ser confiable para que el sistema sea
seguro. La seguridad la da la firma Ed25519, el servidor solo es logística.

---

## 0. Rol del componente

```
                     ┌────────────────────────┐
                     │  Directory Server        │
                     │  (solo .onion, sin logs)  │
                     │                           │
                     │  clave_pública → [onion1,  │
                     │                   onion2]  │
                     └────────────┬──────────────┘
                                  │
                    consulta firmada, sin revelar quién pregunta a quién
                                  │
      ┌───────────────┬──────────┴─────────┬───────────────┐
      ▼               ▼                    ▼               ▼
  Nodo Ana        Nodo Pedro           Nodo María       Nodo Juan
      └───────────────┴── mensajes P2P directos, nunca vía directory ──┘
```

**No participa en el envío de mensajes.** Solo resuelve direcciones. Corre
exclusivamente como hidden service `.onion` (nunca clearnet), para que ni
él mismo vea IPs reales de quien consulta.

---

## 1. Mensaje `NODE_UPDATE` (publicación de nodo)

Un nodo publica o actualiza sus direcciones `.onion` conocidas mediante un
mensaje firmado con su clave Ed25519 de identidad.

```json
{
  "type": "NODE_UPDATE",
  "identity": "ed25519:base64_clave_publica",
  "onion_addresses": [
    "xxxxxxxx1.onion",
    "xxxxxxxx2.onion"
  ],
  "timestamp": 1752400000,
  "ttl_seconds": 604800,
  "signature": "ed25519:base64_firma_sobre_los_campos_anteriores"
}
```

- `signature` cubre `identity + onion_addresses + timestamp + ttl_seconds`
  serializados canónicamente (orden fijo de campos, sin espacios).
- `ttl_seconds` (recomendado: 7 días) — pasado ese tiempo desde `timestamp`,
  el directory descarta la entrada si no se ha renovado. Evita acumular
  direcciones `.onion` muertas indefinidamente.
- El directory **verifica la firma antes de almacenar** — un `NODE_UPDATE`
  sin firma válida se descarta sin más.

### Dos canales de propagación para este mismo payload

| Canal | Cuándo se usa | Quién lo ve |
|---|---|---|
| **B — Directo (E2E)** | Con contactos ya establecidos | Solo el destinatario, cifrado por el canal existente |
| **A — Gossip / Directory** | Primer contacto o red de resiliencia | Directory server + nodos intermedios en la propagación, pero nunca pueden falsificarlo (solo censurarlo) |

Ambos canales transportan el **mismo `NODE_UPDATE` firmado** — no hay
diferencia de confianza entre ellos, solo de alcance y latencia.

---

## 2. Consulta al directory (`NODE_LOOKUP`)

Para minimizar metadata expuesta al propio directory, la consulta se hace
también vía `.onion` (el circuito Tor ya evita que el directory vea la IP
real del que pregunta) y **sin autenticar quién pregunta**:

```json
{
  "type": "NODE_LOOKUP",
  "identity": "ed25519:base64_clave_publica_buscada"
}
```

Respuesta:

```json
{
  "type": "NODE_LOOKUP_RESPONSE",
  "identity": "ed25519:base64_clave_publica_buscada",
  "onion_addresses": ["xxxxxxxx1.onion", "xxxxxxxx2.onion"],
  "last_updated": 1752400000
}
```

**Importante:** la consulta no requiere que el solicitante se identifique.
Esto es intencional — así el directory no puede construir un grafo de
"quién pregunta por quién" vinculado a una identidad, solo ve tráfico Tor
anónimo llegando por su hidden service.

---

## 3. Protecciones anti-abuso

### Anti-Sybil / anti-suplantación
- Ya cubierto por la firma Ed25519: nadie puede publicar un `NODE_UPDATE`
  para una `identity` que no controla, porque no tiene la clave privada.

### Anti-DoS (rate limiting)
- Límite de `NODE_UPDATE` aceptados por `identity` por ventana de tiempo
  (ej. máx. 1 actualización cada 5 minutos por clave pública) — evita que
  alguien con una clave válida inunde el directory con actualizaciones.
- Límite de `NODE_LOOKUP` por circuito/IP de origen del hidden service
  (ej. vía `hashcash`-like proof-of-work ligero o simplemente rate limit
  por conexión Tor, ya que no hay identidad de solicitante que limitar).

### Anti-acumulación
- TTL obligatorio en cada entrada (sección 1). Barrido periódico (cron
  interno del propio directory) que purga entradas caducadas.

### Sin logging de consultas
- El directory **no debe loggear** qué `identity` se consultó desde qué
  circuito Tor, ni siquiera en logs de aplicación temporales — solo
  métricas agregadas (nº de consultas/seg) para observabilidad operativa,
  igual que ya defines para el relay.

---

## 4. Sustituibilidad (sin dependencia de un directory único)

El protocolo no asume que exista un único directory server operado por
Redder Labs. Cualquier nodo puede correr su propio directory, y un cliente
puede configurarse para consultar varios en paralelo (similar a cómo los
clientes BitTorrent consultan varios trackers, o Matrix federa homeservers).

```ts
// Configuración del cliente — lista de directories conocidos, no hardcoded a uno
const DIRECTORY_SERVERS = [
  "http://directory1xxxxx.onion",
  "http://directory2xxxxx.onion", // operado por un tercero de confianza, opcional
];
```

Si todos los directories configurados están caídos, el descubrimiento cae
a los canales ya existentes (QR/enlace manual, gossip entre contactos
directos vía canal B) — el directory es una optimización de conveniencia,
no una dependencia estructural.

---

## 5. Servicio en el monorepo

Estructura sugerida (ajustar a tu convención real de Turborepo):

```
apps/
  directory/
    src/
      index.ts        # Fastify, endpoints NODE_UPDATE / NODE_LOOKUP
      verify.ts        # verificación de firma Ed25519 (libsodium)
      store.ts          # persistencia (Postgres o incluso solo Dragonfly con TTL nativo)
      rateLimit.ts
    Dockerfile
    package.json
```

**Nota de almacenamiento:** dado que cada entrada ya lleva TTL nativo,
Dragonfly (o Redis) con expiración automática por clave (`EXPIRE`) encaja
mejor que Postgres para este componente — evita tener que implementar tú
mismo el barrido de entradas caducadas.

### Añadir al `docker-compose.yml`

```yaml
  directory:
    build: ./apps/directory
    environment:
      # Dragonfly habla protocolo Redis (redis://). Misma instancia que el relay, otra DB.
      - REDIS_URL=redis://dragonfly:6379
      - DIRECTORY_DB_INDEX=1   # DB separada de la usada por el relay, mismo Dragonfly
      # HOST=0.0.0.0 OBLIGATORIO en Docker (si no, Fastify bindea 127.0.0.1 y el contenedor
      # tor no lo alcanza — mismo motivo que el relay, ver aegis-node-proxmox-setup.md §4).
      - HOST=0.0.0.0
      - PORT=8444
    networks:
      - relay-net
    restart: unless-stopped
    depends_on:
      - dragonfly
    # sin "ports:" al host — solo accesible vía su propio hidden service
```

`torrc`, hidden service adicional para el directory (independiente del
relay, direcciones `.onion` distintas):

```
HiddenServiceDir /var/lib/tor/aegis-directory/
# Igual que el relay: puerto virtual 80 (el cliente hace fetch a http://…onion sin puerto),
# reenviado al servicio `directory` en la red de Docker por su NOMBRE, no 127.0.0.1
# (127.0.0.1 sería el propio contenedor tor). El directory Fastify escucha en 8444.
HiddenServicePort 80 directory:8444
HiddenServiceVersion 3
```

> El servicio `directory` NO publica puerto al host (igual que el relay): solo se alcanza
> por Caddy —si quisieras clearnet, que aquí no— o por su hidden service vía Tor. El puerto
> `8444` es interno de Docker y distinto del `8443` del relay.

---

## 6. Checklist de diseño antes de implementar

- [ ] Formato canónico de serialización para la firma definido y testeado
      (mismo criterio en cliente TS y verificación en el directory)
- [ ] Librería de firma Ed25519 consistente entre cliente (libsodium/WASM)
      y servidor (libsodium en Node)
- [ ] Rate limiting implementado antes de exponer el directory públicamente
- [ ] Confirmar que no se loguea ninguna IP/circuito en `NODE_LOOKUP`
- [ ] TTL y barrido de entradas caducadas probado
- [ ] Documentar en `THREAT_MODEL.md` qué metadata SÍ puede inferir un
      directory malicioso (grafo de qué claves existen, timing de consultas
      agregado) vs qué NO puede hacer (falsificar identidad, leer mensajes)
