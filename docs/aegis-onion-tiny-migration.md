# Migración de la puerta `.onion` a un nodo dedicado (el Tiny) — runbook

Aísla la puerta `.onion` de la Coolify VM a una máquina propia (el **Tiny**), conservando la
dirección `gennbz5…onion`. Reduce el blast-radius y aísla la clave `hs_ed25519`. Topología elegida:
**puerto LAN + firewall** (el tramo Tiny→Coolify va por la red local; si quieres cifrarlo, cambia a
WireGuard — ver §6).

```
[Tor Browser] --Tor--> [Tiny: solo Tor] --LAN--> [Coolify VM: web:3000 / relay:8443 / BBDD]
```

**Variables** (rellena las tuyas):
- `COOLIFY_HOST` = IP LAN de la Coolify VM = `192.168.8.102`
- `TINY_IP` = IP LAN del Tiny = `192.168.8.___`  ← **complétala** (`ip -4 addr` en el Tiny)
- `IFACE` = interfaz LAN de la Coolify VM = `ens18` (de su banner de login)

> ⚠️ **Docker se salta ufw.** Los puertos que publica un contenedor NO los filtra ufw. Por eso el
> firewall de los puertos de app (3000/8443) se hace en la cadena **DOCKER-USER** (§5), no en ufw.
> ufw sigue valiendo para los servicios del host (SSH, etc.).

---

## 1. Preparar el Tiny

```bash
# En el Tiny: Docker ya está. Clona el repo (o haz git pull si ya lo tienes).
git clone <repo> aegis && cd aegis
git checkout feat/node-onion-tor-caddy   # o main si ya está mergeado
```

## 2. Copiar la clave de la onion (Coolify VM → Tiny)

Conserva `gennbz5…onion`: hay que llevar el contenido del volumen `aegis-tor-data` (claves
`hs_ed25519_secret_key` de `aegis-web` y `aegis-relay`) al Tiny. Se hace con la onion vieja AÚN
corriendo (la copia es de solo lectura, no la interrumpe).

```bash
# --- En la Coolify VM ---
# Nombre real del volumen (Coolify lo prefija):
VOL=$(sudo docker volume ls --format '{{.Name}}' | grep -i tor | head -n1); echo "$VOL"
# Empaquetar las dos claves:
sudo docker run --rm -v "$VOL":/src -v /tmp:/dst alpine \
  tar czf /dst/onion-keys.tgz -C /src aegis-web aegis-relay
# Llevarlo al Tiny:
scp /tmp/onion-keys.tgz aegis@<TINY_IP>:/tmp/
```

```bash
# --- En el Tiny ---
docker volume create aegis-tor-data
docker run --rm -v aegis-tor-data:/dst -v /tmp:/src alpine \
  tar xzf /src/onion-keys.tgz -C /dst
# (los permisos los arregla el entrypoint al arrancar: chown tor:tor, chmod 700)
rm /tmp/onion-keys.tgz   # no dejes la clave privada en /tmp
```

## 3. Publicar los puertos de app en la Coolify VM

Ya está en `docker-compose.coolify.yml` (los `ports` de `web` y `relay` atados a `LAN_BIND_IP`, y
el servicio `tor` retirado). En Coolify:
- Añade la variable `LAN_BIND_IP=192.168.8.102` (o deja el default del compose).
- **Redeploy.** Esto publica `192.168.8.102:3000` y `:8443` **y retira el `tor` colocado** → la onion
  vieja se apaga aquí. Habrá unos minutos sin onion hasta el paso 4 (el clearnet sigue arriba).

## 4. Levantar la onion en el Tiny

```bash
# --- En el Tiny ---
COOLIFY_HOST=192.168.8.102 docker compose -f docker-compose.tor-node.yml up -d --build
```

Verificar (dar ~30-60 s a que abra circuito):
```bash
TOR=$(docker ps --format '{{.Names}}' | grep -i tor | head -n1)
docker logs "$TOR" | tail -20                                  # "Bootstrapped 100%"
docker exec "$TOR" cat /var/lib/tor/aegis-web/hostname         # gennbz5…onion (misma dirección ✅)
docker exec "$TOR" curl -s --socks5-hostname 127.0.0.1:9050 \
  http://gennbz5cadkhpqn44wvbdxmkj5etij2tiganbyje4d52cgqsgz3nthqd.onion/api/health
#   → {"status":"ok","db":"up"}  (onion → LAN → web:3000 → /api → relay)
```

Si el `curl` responde el health, la onion ya sirve desde el Tiny. Ábrela en Tor Browser para el e2e real.

## 5. Firewall: restringir los puertos de app a SOLO el Tiny (DOCKER-USER)

En la **Coolify VM**. Sin esto, cualquier host del LAN podría hablar con `web:3000`/`relay:8443`.
Se filtra en `ens18` (la LAN física); el tráfico interno de Docker entra por el bridge, no por
`ens18`, así que NO se ve afectado (web→relay sigue igual).

```bash
# --- En la Coolify VM ---
sudo iptables -I DOCKER-USER -i ens18 -p tcp --dport 3000 ! -s <TINY_IP> -j DROP
sudo iptables -I DOCKER-USER -i ens18 -p tcp --dport 8443 ! -s <TINY_IP> -j DROP
# Persistir entre reinicios:
sudo apt install -y iptables-persistent && sudo netfilter-persistent save
```

Comprobar: desde OTRO host del LAN (no el Tiny) `curl http://192.168.8.102:3000` debe **colgarse/fallar**;
desde el Tiny debe responder.

## 6. Limpieza y notas

- El volumen `aegis-tor-data` de la **Coolify VM** queda como backup de la clave. Bórralo cuando estés
  seguro: `sudo docker volume rm "$VOL"`.
- `NEXT_PUBLIC_WEB_ONION_URL` **no cambia** (misma dirección) → nada que rehornear.
- Hardening del Tiny: ufw default-deny, permitir solo SSH desde el LAN (Tor es saliente, no necesita
  nada entrante). Ver [[aegis-antidos-hardening]].
- **Alternativa WireGuard** (si no quieres los puertos de app en el LAN ni en claro): monta un túnel
  wg entre Tiny y Coolify, pon `COOLIFY_HOST` = IP wg de la Coolify VM, y publica los puertos solo en
  la interfaz `wg0` en vez de `ens18`. Más seguro, más montaje.
```
