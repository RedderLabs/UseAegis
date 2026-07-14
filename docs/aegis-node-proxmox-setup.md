# Aegis — Instalación de nodo en Proxmox (Clearnet + .onion)

Guía de despliegue local del relay de Aegis en un LXC de Proxmox (ThinkCentre),
con doble vía de acceso: dominio clearnet normal y hidden service `.onion`
activado mediante switch en la app.

---

## 0. Arquitectura del nodo

```
                     ┌─────────────────────────────┐
                     │        LXC Proxmox           │
                     │                               │
Usuario (switch OFF) │  relay.aegis.local (HTTPS) ──┐│
        │            │                              ││
        ▼            │                         ┌────▼▼────┐
   Clearnet ──────────►                         │ Fastify   │
                     │                          │ (relay)   │
Usuario (switch ON)  │                          └────┬──────┘
        │            │                               │
        ▼            │   xxxxxxxx.onion (HTTP) ───────┤
   Red Tor ───────────► Tor hidden service            │
                     │                          ┌─────▼─────┐
                     │                          │ Postgres   │
                     │                          │ Dragonfly  │
                     │                          └────────────┘
                     └─────────────────────────────┘
```

- **Contenido:** cifrado E2E con libsodium (X25519/XChaCha20), independiente del transporte.
- **Transporte clearnet:** HTTPS (TLS) obligatorio.
- **Transporte `.onion`:** HTTP plano es suficiente — el cifrado por capas de Tor ya protege el circuito.
- **Postgres y Dragonfly:** nunca expuestos fuera de la red interna del LXC.

---

## 1. Crear el LXC en Proxmox

```bash
# Desde la shell de Proxmox
pct create 200 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname aegis-relay \
  --cores 2 \
  --memory 2048 \
  --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1

pct start 200
pct enter 200
```

> `nesting=1` es necesario para poder correr Docker dentro del LXC.

---

## 2. Preparar el sistema base

```bash
apt update && apt upgrade -y
apt install -y curl git nano ufw

# Docker
curl -fsSL https://get.docker.com | sh

# Firewall básico
ufw allow 22
ufw allow 443
ufw allow 80
ufw enable
```

---

## 3. Configurar Tor (hidden service)

> **Una sola instancia de Tor.** No instales Tor con `apt` en el host: el hidden
> service corre en el contenedor `tor` de la compose (§4). Ese contenedor comparte la
> red `relay-net`, así que resuelve el nombre `relay` — un Tor nativo del host **no**
> podría alcanzar `relay` (está en la red interna de Docker, sin puerto publicado).

Crea el fichero `torrc` **junto al `docker-compose.yml`** (se monta en el contenedor `tor`):

```
# ./torrc  (montado en el contenedor tor)
HiddenServiceDir /var/lib/tor/aegis-relay/
# El cliente hace fetch a http://xxxxxxxx.onion → puerto virtual 80 (HTTP plano).
# Se reenvía al relay Fastify, que escucha en 8443 (ver apps/relay/.env → PORT=8443).
HiddenServicePort 80 relay:8443
HiddenServiceVersion 3
SocksPort 0.0.0.0:9050
```

> - **Puerto virtual 80, no 443:** el cliente (`apps/web/lib/relay-client.ts`) apunta a
>   `http://…onion` sin puerto → Tor usa el 80. Con 443 la conexión sería rechazada.
> - **`relay:8443`:** `relay` es el nombre del servicio Fastify en la red de Docker (§4);
>   `8443` es el puerto real del relay (no 3000).

Levanta la compose (§4) y obtén la dirección `.onion` desde el volumen del contenedor:

```bash
docker compose up -d tor
docker compose exec tor cat /var/lib/tor/aegis-relay/hostname
```

Guarda esa dirección — es la que la app usará cuando el usuario active el switch de privacidad
(`NEXT_PUBLIC_RELAY_ONION_URL` en el cliente web).

---

## 4. docker-compose.yml del nodo

```yaml
services:
  tor:
    image: dperson/torproxy
    volumes:
      - ./torrc:/etc/tor/torrc          # define el hidden service (§3)
      - tor-data:/var/lib/tor           # persiste HiddenServiceDir → la .onion no cambia
    ports:
      - "127.0.0.1:9050:9050"           # SOCKS solo en localhost, para probar la .onion (§5)
    networks:
      - relay-net
    restart: unless-stopped

  relay:
    build: ./relay
    environment:
      - DATABASE_URL=postgresql://aegis:pass@postgres:5432/aegis
      # Dragonfly habla protocolo Redis → la var sigue siendo REDIS_URL (redis://).
      - REDIS_URL=redis://dragonfly:6379
      - NODE_ENV=production
      # HOST=0.0.0.0 es OBLIGATORIO en Docker: por defecto el relay bindea a
      # 127.0.0.1 (apps/relay/src/config.ts) y Caddy/Tor —en otros contenedores—
      # no podrían alcanzarlo. PORT debe coincidir con el destino de Caddy y torrc.
      - HOST=0.0.0.0
      - PORT=8443
    networks:
      - relay-net
    restart: unless-stopped
    # sin "ports:" hacia el host — solo accesible vía Caddy (clearnet) o Tor (.onion)

  caddy:
    image: caddy:2-alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    networks:
      - relay-net
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_USER=aegis
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=aegis
    volumes:
      - pg-data:/var/lib/postgresql/data
    networks:
      - relay-net
    restart: unless-stopped
    # sin "ports:" expuesto

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:v1.39.0
    # Dragonfly bloquea memoria en RAM y exige memlock ilimitado para arrancar bien.
    ulimits:
      memlock: -1
    # Durabilidad por snapshot (no appendonly): guarda en /data al parar y cada 5 min.
    command: ["--dir", "/data", "--dbfilename", "dump", "--snapshot_cron", "*/5 * * * *"]
    volumes:
      - dragonfly-data:/data
    networks:
      - relay-net
    restart: unless-stopped
    # sin "ports:" expuesto

networks:
  relay-net:

volumes:
  tor-data:
  caddy-data:
  pg-data:
  dragonfly-data:
```

`Caddyfile` (clearnet, dominio local de pruebas):

```
relay.aegis.local {
    reverse_proxy relay:8443
    tls internal
}
```

> `tls internal` genera un certificado autofirmado válido para pruebas en red local.
> Añade `relay.aegis.local` a tu `/etc/hosts` en el equipo cliente apuntando a la IP del LXC.

Levantar todo:

```bash
docker compose up -d
docker compose ps
curl -k https://relay.aegis.local/health   # prueba clearnet
```

---

## 5. Verificar el hidden service desde fuera

Desde cualquier máquina con Tor instalado (o el propio LXC):

```bash
curl --socks5-hostname 127.0.0.1:9050 http://TU_DIRECCION.onion/health
```

Si responde el healthcheck, el circuito completo funciona:
**cliente Tor → red Tor → hidden service → Fastify → Postgres/Dragonfly.**

---

## 6. Lógica del switch en la app (cliente)

Pseudocódigo del comportamiento esperado en el cliente (React Native + Rust/WASM core):

```ts
async function getRelayEndpoint(privacyMode: boolean): Promise<string> {
  if (privacyMode) {
    await torClient.ensureBootstrapped(); // Arti embebido
    return "http://TU_DIRECCION.onion";
  }
  return "https://relay.aegis.local"; // o relay.aegis.app en producción
}
```

- **Switch OFF** → conexión directa a `relay.aegis.local` (o dominio de producción) por HTTPS.
- **Switch ON** → se levanta Tor embebido (Arti) en background y todo el tráfico
  del relay pasa por `TU_DIRECCION.onion`, sin que el usuario instale nada aparte.
- El mismo backend Fastify, Postgres y Dragonfly sirven ambos modos — no hay
  duplicación de infraestructura, solo dos puertas de entrada distintas.

---

## 7. Logs y depuración

```bash
# Tor
journalctl -u tor -f

# Docker
docker compose logs -f relay
docker compose logs -f tor
```

> Importante: no mezclar logs de acceso clearnet y `.onion` en el mismo archivo,
> para evitar correlación de tráfico entre ambos modos en el propio servidor.

---

## 8. Checklist de validación

- [ ] LXC creado y accesible por `pct enter 200`
- [ ] Docker funcionando dentro del LXC (`nesting=1` activo)
- [ ] `docker compose ps` muestra los 5 servicios `Up`
- [ ] `curl -k https://relay.aegis.local/health` responde OK (modo clearnet)
- [ ] `docker compose exec tor cat /var/lib/tor/aegis-relay/hostname` devuelve una dirección `.onion` v3
- [ ] `curl --socks5-hostname 127.0.0.1:9050 http://TU_ONION/health` responde OK (modo Tor)
- [ ] Postgres y Dragonfly **no** tienen puertos publicados al host (`docker compose config` para revisar)
- [ ] Switch en la app cambia correctamente entre ambos endpoints

---

## 9. Siguientes pasos (fuera de este documento)

- Migrar este mismo `docker-compose.yml` + `torrc` a la VPS (Njalla / 1984 Hosting) para producción 24/7.
- Sustituir el dominio de pruebas `relay.aegis.local` por el dominio real de producción con Let's Encrypt.
- Integrar Arti (Tor en Rust) en `packages/crypto-core` para el modo Tor embebido en la app.
- Definir política de fallback automático (clearnet bloqueado → `.onion` sin intervención manual).