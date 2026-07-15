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
> service corre en el contenedor `aegis-tor` de la compose (§4). Ese contenedor comparte la
> red interna de compose, así que resuelve el nombre `aegis-relay` — un Tor nativo del host
> **no** podría alcanzarlo (está en la red interna de Docker, sin puerto publicado).

El `torrc` y el `Dockerfile` de Tor **ya viven en el repo**, en `infra/tor/` (se montan/
construyen desde el `docker-compose.yml` raíz, servicio `aegis-tor`). Contenido real de
`infra/tor/torrc`:

```
HiddenServiceDir /var/lib/tor/aegis-relay
HiddenServiceVersion 3
# El cliente hace fetch a http://xxxxxxxx.onion → puerto virtual 80 (HTTP plano).
# Se reenvía al relay Fastify, que escucha en 8443 dentro de la red de Docker.
HiddenServicePort 80 aegis-relay:8443
SocksPort 0.0.0.0:9050
```

> - **Puerto virtual 80, no 443:** el cliente (`apps/web/lib/relay-client.ts`) apunta a
>   `http://…onion` sin puerto → Tor usa el 80. Con 443 la conexión sería rechazada.
> - **`aegis-relay:8443`:** `aegis-relay` es el nombre REAL del servicio Fastify en la red de
>   Docker (no `relay`); `8443` es el puerto del relay (no 3000).
> - **OJO — Tor no resuelve DNS en `HiddenServicePort`** (exige una IP literal). Por eso el
>   `entrypoint.sh` del contenedor resuelve `aegis-relay` a su IP de la red de Docker al
>   arrancar y reescribe una copia del torrc antes de lanzar Tor. El fichero del repo se deja
>   con el nombre de servicio (legible/portable); la sustitución a IP es en tiempo de arranque.
> - La imagen de Tor se construye desde `infra/tor/Dockerfile` (Alpine oficial + `tor`, corre
>   como usuario `tor` con el HiddenServiceDir en 700, sin entrypoints mágicos de terceros).

Levanta la compose (§4) y obtén la dirección `.onion` desde el volumen del contenedor
(persistido en `aegis-tor-data` → la `.onion` NO cambia entre reinicios):

```bash
docker compose --profile node exec aegis-tor cat /var/lib/tor/aegis-relay/hostname
```

Guarda esa dirección — es la que la app usará cuando el usuario active el switch de privacidad
(`NEXT_PUBLIC_RELAY_ONION_URL` en el cliente web).

---

## 4. docker-compose.yml del nodo

**No hay un compose aparte para el nodo.** Se usa el `docker-compose.yml` de la raíz del repo
(el mismo de dev), y los servicios del nodo —`aegis-relay`, `aegis-tor`, `aegis-caddy`— están
bajo el **perfil opt-in `node`**, así que NO arrancan en desarrollo. `aegis-db` y
`aegis-dragonfly` no tienen perfil (son base). Nombres reales de servicio:

| Servicio | Perfil | Rol | Puerto host |
|---|---|---|---|
| `aegis-db` | (base) | Postgres 16 (auth) | `127.0.0.1:15432` |
| `aegis-dragonfly` | (base) | Cola de blobs (RESP) | `127.0.0.1:16379` |
| `aegis-relay` | `node` | Fastify (`HOST=0.0.0.0 PORT=8443`) | `127.0.0.1:8443` |
| `aegis-tor` | `node` | Hidden service `.onion` (`infra/tor`) | `127.0.0.1:9050` (SOCKS) |
| `aegis-caddy` | `node` | TLS + reverse proxy clearnet (`infra/caddy`) | `80`, `443` |

> - Los servicios se resuelven entre sí por **nombre** en la red por defecto de compose
>   (`aegis_default` en el nodo). Por eso `aegis-tor`/`aegis-caddy` llegan a `aegis-relay:8443`
>   sin publicar ese puerto.
> - `aegis-relay` publica `127.0.0.1:8443` SOLO para `curl` local; en clearnet real entra por
>   Caddy y Tor lo alcanza por la red interna.
> - Nota memlock de Dragonfly en LXC no privilegiado: ver la cabecera del `docker-compose.yml`
>   (se quitó `ulimits: memlock: -1`, rompía en el LXC). Para subirlo, `lxc.prlimit.memlock`
>   host-side en la config del CT.

`infra/caddy/Caddyfile` (clearnet, dominio local de pruebas):

```
relay.aegis.local {
	reverse_proxy aegis-relay:8443
	tls internal
}
```

> `tls internal` genera un certificado autofirmado válido para pruebas en red local.
> Añade `relay.aegis.local` a tu `/etc/hosts` en el equipo cliente apuntando a la IP del LXC.
> En producción: dominio real + quitar `tls internal` (Let's Encrypt automático).

Levantar TODO el nodo (construye relay y tor, arranca los 5):

```bash
cd ~/Aegis            # la carpeta del repo clonado (no proyecto-Aegis)
git pull              # trae infra/tor, infra/caddy y el compose actualizado
docker compose --profile node up -d --build
docker compose --profile node ps
curl -sk https://relay.aegis.local/health   # prueba clearnet vía Caddy (o -k con la IP del LXC)
```

---

## 5. Verificar el hidden service desde fuera

Desde el propio LXC (usa el SOCKS del contenedor `aegis-tor`, publicado en loopback):

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
# Tor (contenedorizado; NO hay tor nativo → nada de journalctl -u tor)
docker compose --profile node logs -f aegis-tor

# Relay / Caddy
docker compose --profile node logs -f aegis-relay
docker compose --profile node logs -f aegis-caddy
```

> Importante: no mezclar logs de acceso clearnet y `.onion` en el mismo archivo,
> para evitar correlación de tráfico entre ambos modos en el propio servidor.

---

## 8. Checklist de validación

- [ ] LXC creado y accesible por `pct enter 200`
- [ ] Docker funcionando dentro del LXC (`nesting=1` activo)
- [ ] `docker compose --profile node ps` muestra los 5 servicios `Up`
- [ ] `curl -k https://relay.aegis.local/health` responde OK (modo clearnet vía Caddy)
- [ ] `docker compose --profile node exec aegis-tor cat /var/lib/tor/aegis-relay/hostname` devuelve una dirección `.onion` v3
- [ ] `curl --socks5-hostname 127.0.0.1:9050 http://TU_ONION/health` responde OK (modo Tor)
- [ ] Postgres y Dragonfly solo publican en `127.0.0.1` (`docker compose --profile node config` para revisar)
- [ ] Switch en la app cambia correctamente entre ambos endpoints

---

## 9. Siguientes pasos (fuera de este documento)

- Migrar este mismo `docker-compose.yml` + `torrc` a la VPS (Njalla / 1984 Hosting) para producción 24/7.
- Sustituir el dominio de pruebas `relay.aegis.local` por el dominio real de producción con Let's Encrypt.
- Integrar Arti (Tor en Rust) en `packages/crypto-core` para el modo Tor embebido en la app.
- Definir política de fallback automático (clearnet bloqueado → `.onion` sin intervención manual).