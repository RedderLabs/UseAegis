# coturn (STUN/TURN) — despliegue y verificación

Cierra el último arrastre técnico de la **Fase 4**: el Modo B (P2P) atraviesa NAT **entre dos redes
distintas**, no solo NAT permisiva.

> **Qué queda fuera de este documento.** Desplegar coturn **no** da por validada la travesía: eso
> exige la prueba humana de §5 (dos navegadores en **dos ISP distintos**). Este doc deja el servidor
> en pie y verificado; la prueba es el paso siguiente.

---

## 1. Por qué autoalojado (y qué ve el servidor)

Sin servidores ICE, el WebRTC del Modo B solo dispone de candidatos de host: funciona con ambos
navegadores en la misma red y falla en cuanto hay dos NAT por medio. La salida habitual es apuntar a
un STUN público (Google, Cloudflare…), y ahí está el problema: **ese tercero vería la IP de cada
usuario que arranca el Modo B**, que es justo lo que el modelo de amenaza evita. Por eso el valor por
defecto de `NEXT_PUBLIC_P2P_ICE_SERVERS` es **vacío**.

Autoalojarlo no elimina al observador, lo **colapsa contra uno que ya existe**: el mismo host que
sirve la web clearnet. No se añade un tercero nuevo.

Lo que coturn ve y lo que no:

| Ve | No ve |
| --- | --- |
| IP:puerto de los pares que piden candidatos | El contenido: va cifrado E2E por encima |
| Volumen y duración del relevo (si se usa TURN) | El texto en claro, ni con las credenciales del TURN |
| Que ese usuario está usando el Modo B | Nada de lo que pasa **sobre Tor**: allí no hay WebRTC |

Con `stun:` el servidor solo responde «tu IP pública es X» y los pares hablan **directamente**. Solo
se cae a `turn:` (relevo real del tráfico) cuando ninguna combinación de candidatos conecta.

---

## 2. Requisitos previos

1. **Un registro DNS A** apuntando a la IP pública del host, p. ej. `turn.useaegis.app` → `A` → esa IP.
   Puede ser el mismo host de la web: coturn no compite por el 443.
2. **La IP pública IPv4** del host, a mano (va en `TURN_EXTERNAL_IP`).
3. **Puertos abiertos** en el cortafuegos (§3). Traefik **no** interviene: el grueso de TURN es UDP y
   Traefik no lo proxea, así que el servicio publica sus puertos directamente en el host.

---

## 3. Cortafuegos

```bash
ufw allow 3478/udp comment 'coturn STUN/TURN'
ufw allow 3478/tcp comment 'coturn STUN/TURN (fallback TCP)'
ufw allow 5349/tcp comment 'coturn TURNS (solo si montas certificado)'
ufw allow 49160:49200/udp comment 'coturn relay range'
ufw reload
```

> ⚠️ **Gotcha conocido de este host:** un `ufw default deny` rompió los despliegues de Coolify (se
> hace SSH a sí mismo por `host.docker.internal`). Si tocas las políticas por defecto, mantén el
> `allow 22` desde `172.16.0.0/12` y `10.0.0.0/8`. Ver `docs/aegis-coolify-deploy.md`.

El rango de relevo es **estrecho a propósito** (41 puertos): cada puerto publicado en Docker levanta
su propio `docker-proxy`, y el rango de 10k puertos que sugieren muchas guías tumba el arranque del
host. Si algún día se queda corto, hay que ampliarlo **en los dos sitios a la vez**:
`infra/coturn/turnserver.conf.template` (`min-port`/`max-port`) y el `ports:` del compose.

---

## 4. Variables y despliegue

En el panel de Coolify (no en el repo):

| Variable | Obligatoria | Valor |
| --- | --- | --- |
| `TURN_EXTERNAL_IP` | ✅ | IP pública IPv4 del host |
| `TURN_USER` | ✅ | p. ej. `aegis` |
| `TURN_PASSWORD` | ✅ | `openssl rand -base64 24` |
| `TURN_REALM` | — | por defecto `useaegis.app` |

Sin `TURN_USER`/`TURN_PASSWORD` el contenedor **aborta al arrancar**, a propósito: un TURN abierto es
ancho de banda gratis para cualquiera que lo encuentre (y los escanean).

Despliega, y comprueba en los logs:

```
[coturn] Sin certificado legible en /etc/coturn/certs/fullchain.pem: arranca SOLO turn:3478 (sin turns:).
[coturn] realm=useaegis.app external-ip=<IP> relay=49160-49200
```

**Luego apunta el cliente** (variables **build-time** → exigen **REDEPLOY del servicio `web`**):

```
NEXT_PUBLIC_P2P_ICE_SERVERS=stun:turn.useaegis.app:3478,turn:turn.useaegis.app:3478
NEXT_PUBLIC_P2P_TURN_USER=<TURN_USER>
NEXT_PUBLIC_P2P_TURN_CREDENTIAL=<TURN_PASSWORD>
```

### TLS (`turns:5349`) — opcional

Sin certificado, coturn arranca solo con `turn:3478` y **es suficiente**: el payload ya va cifrado E2E
y, además, DTLS entre pares. `turns:` sirve sobre todo para atravesar cortafuegos corporativos que
solo dejan salir TLS. Para habilitarlo: monta un certificado válido del dominio del TURN en
`/etc/coturn/certs` (descomenta el bloque `volumes:` del servicio) y añade
`turns:turn.useaegis.app:5349` a la lista de ICE.

---

## 5. Verificación

**a) El servidor responde (desde otra máquina, no desde el host):**

```bash
# Requiere coturn-utils / turnutils. Debe devolver la reflexive address (tu IP pública).
turnutils_stunclient -p 3478 turn.useaegis.app

# Relevo TURN completo, con credenciales:
turnutils_uclient -v -u <TURN_USER> -w <TURN_PASSWORD> -p 3478 turn.useaegis.app
```

**b) El navegador obtiene candidatos `srflx` y `relay`:** abre <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>,
mete `turn:turn.useaegis.app:3478` con usuario y credencial, y **Gather candidates**. Debe aparecer al
menos un `srflx` (STUN funciona) y un `relay` (TURN funciona). Si solo salen `host`, el problema es
cortafuegos o `TURN_EXTERNAL_IP`.

**c) Prueba NAT-a-NAT real — el paso humano que cierra el arrastre.** Dos navegadores en **dos ISP
distintos** (p. ej. fibra de casa y datos móviles, sin Wi-Fi), misma conversación, Modo B forzado:

1. Verifica que el indicador de estado del header marca **P2P** en ambos lados.
2. Intercambia mensajes en las dos direcciones.
3. En `chrome://webrtc-internals`, confirma el par de candidatos seleccionado: `srflx/srflx` = travesía
   directa (lo ideal); `relay` = está pasando por el TURN (funciona, pero consume ancho de banda del
   servidor).
4. Corta el Modo B y comprueba que el **failover a Modo A** entra y la conversación sigue.

Mientras (c) no se haya hecho, en el ROADMAP la travesía NAT-a-NAT sigue **sin validar**.

---

## 6. Coste y límites

Las cuotas de `turnserver.conf.template` (`total-quota=100`, `user-quota=12`, `max-bps=256000`) están
puestas para el volumen de esta fase. El relevo TURN consume ancho de banda **del servidor** por cada
par que no logra conexión directa; con texto es despreciable, con audio/archivos no. Si el tráfico
`relay` crece, mira primero por qué falla la travesía directa antes de subir cuotas.

`denied-peer-ip` bloquea el relevo hacia rangos privados: sin eso, cualquiera con las credenciales
podría usar el TURN como pivote hacia el relay, el Postgres o la red interna del host.
